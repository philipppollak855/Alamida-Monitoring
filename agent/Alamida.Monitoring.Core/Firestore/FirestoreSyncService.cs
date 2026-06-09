using System.Security.Cryptography;
using System.Text;
using Alamida.Monitoring.Core.Models;
using Google.Cloud.Firestore;

namespace Alamida.Monitoring.Core.Firestore;

public sealed class FirestoreSyncService : IAsyncDisposable
{
    private static readonly TimeSpan HeartbeatWriteInterval = TimeSpan.FromMinutes(3);

    private readonly FirestoreDb _db;
    private readonly string _workstationId;
    private readonly SterbefallFirestoreCache _cache = new();

    public FirestoreSyncService(string projectId, string serviceAccountPath, string workstationId)
    {
        Environment.SetEnvironmentVariable("GOOGLE_APPLICATION_CREDENTIALS", serviceAccountPath);
        _db = FirestoreDb.Create(projectId);
        _workstationId = workstationId;
    }

    public FirestoreSyncService(FirestoreDb db, string workstationId)
    {
        _db = db;
        _workstationId = workstationId;
    }

    public DispositionSettingsLoader CreateSettingsLoader() => new(_db);

    public Task<bool> SyncSnapshotAsync(DetailSnapshot snapshot, CancellationToken ct = default) =>
        SyncSnapshotAsync(snapshot, sterbefallWechsel: false, ct).ContinueWith(
            t => t.Result.Kind != SyncResultKind.Skipped, ct);

    public async Task<SyncResult> SyncSnapshotAsync(
        DetailSnapshot snapshot,
        bool sterbefallWechsel,
        CancellationToken ct = default)
    {
        if (!snapshot.HasMinimumData)
            return SyncResult.Skipped();

        var sterbefallId = ResolveSterbefallDocumentId(snapshot);
        var contentHash = snapshot.ContentHash();
        var sterbefallRef = _db.Collection("sterbefaelle").Document(sterbefallId);
        var now = Timestamp.FromDateTime(DateTime.UtcNow);
        var cached = _cache.Get(sterbefallId);

        if (cached != null && cached.ContentHash == contentHash && cached.FullWriteCompleted)
        {
            if (!ShouldWriteHeartbeat(cached, sterbefallWechsel))
                return HeartbeatResult(sterbefallId, sterbefallWechsel, HeartbeatReason.Throttled);

            var inHistoryCached = ResolveInHistoryFromCache(snapshot, cached);
            if (ShouldOnlyTouchLastSeenFromCache(snapshot, cached))
            {
                await sterbefallRef.SetAsync(
                    BuildLastSeenPayload(sterbefallId, snapshot, _workstationId, now),
                    SetOptions.MergeAll,
                    ct);
                _cache.Save(sterbefallId, contentHash, cached.HasDispositionData, inHistoryCached, fullWriteCompleted: true);
                return HeartbeatResult(sterbefallId, sterbefallWechsel, HeartbeatReason.LastSeenOnly);
            }

            await sterbefallRef.SetAsync(
                BuildHeartbeatPayload(sterbefallId, snapshot, inHistoryCached, _workstationId, now),
                SetOptions.MergeAll,
                ct);
            if (inHistoryCached)
                await ArchiveToHistoryFromSnapshotAsync(sterbefallId, snapshot, now, ct);

            _cache.Save(sterbefallId, contentHash, cached.HasDispositionData, inHistoryCached, fullWriteCompleted: true);
            return HeartbeatResult(sterbefallId, sterbefallWechsel, HeartbeatReason.ContentUnchanged);
        }

        DocumentSnapshot? existing = null;
        try
        {
            existing = await FirestoreRetry.ExecuteAsync(
                () => sterbefallRef.GetSnapshotAsync(ct),
                ct,
                maxAttempts: 3);
        }
        catch (Exception ex) when (FirestoreRetry.IsTransient(ex))
        {
            return await SyncWithoutReadAsync(
                snapshot, sterbefallId, sterbefallRef, contentHash, cached, sterbefallWechsel, now, ct);
        }
        catch (Exception ex)
        {
            throw new InvalidOperationException(
                $"Lesen sterbefaelle/{sterbefallId} fehlgeschlagen: {ex.Message}", ex);
        }

        var oldHash = FirestoreFieldHelpers.SafeString(existing!, "contentHash");

        if (ShouldOnlyTouchLastSeen(snapshot, existing!)
            && existing!.ContainsField("updatedAt"))
        {
            await sterbefallRef.SetAsync(
                BuildLastSeenPayload(sterbefallId, snapshot, _workstationId, now),
                SetOptions.MergeAll,
                ct);
            _cache.Save(
                sterbefallId,
                contentHash,
                ExistingHasDispositionData(existing),
                ResolveInHistory(snapshot, existing),
                fullWriteCompleted: true);
            return HeartbeatResult(sterbefallId, sterbefallWechsel, HeartbeatReason.LastSeenOnly);
        }

        snapshot = MergeSnapshotWithExisting(snapshot, existing!);
        contentHash = snapshot.ContentHash();
        oldHash = FirestoreFieldHelpers.SafeString(existing!, "contentHash");

        var inHistory = ResolveInHistory(snapshot, existing!);
        var historieGrund = ResolveHistorieGrund(snapshot, existing!, inHistory);
        Timestamp? sichtbarBis = snapshot.SichtbarBis.HasValue
            ? Timestamp.FromDateTime(snapshot.SichtbarBis.Value.ToUniversalTime())
            : null;

        if (oldHash == contentHash)
        {
            var heartbeatCache = _cache.Get(sterbefallId);
            if (!ShouldWriteHeartbeat(heartbeatCache, sterbefallWechsel))
                return HeartbeatResult(sterbefallId, sterbefallWechsel, HeartbeatReason.Throttled);

            await sterbefallRef.SetAsync(
                BuildHeartbeatPayload(sterbefallId, snapshot, inHistory, _workstationId, now),
                SetOptions.MergeAll,
                ct);

            if (inHistory)
                await ArchiveToHistoryFromSnapshotAsync(sterbefallId, snapshot, now, ct);

            _cache.Save(sterbefallId, contentHash, ExistingHasDispositionData(existing!), inHistory, fullWriteCompleted: true);
            return HeartbeatResult(sterbefallId, sterbefallWechsel, HeartbeatReason.ContentUnchanged);
        }

        var kuehlraum = snapshot.Kuehlraum ?? "";
        var status = ResolveStatus(inHistory, kuehlraum, snapshot.AktuellePositionTyp);

        var verlauf = snapshot.Verlauf.Select(v => new Dictionary<string, object>
        {
            ["nummer"] = v.Nummer,
            ["typ"] = v.Typ,
            ["ort"] = v.Ort ?? "",
            ["vonOrt"] = v.VonOrt ?? "",
            ["nachOrt"] = v.NachOrt ?? "",
            ["terminAm"] = v.TerminAm ?? "",
            ["abholungAm"] = v.TerminAm ?? "",
            ["kuehlraum"] = v.Kuehlraum ?? "",
        }).ToList();

        var ausstehend = BuildAusstehendPayload(snapshot.Ausstehend);

        var sterbefallData = new Dictionary<string, object>
        {
            ["sterbefallId"] = sterbefallId,
            ["verstorbenerName"] = snapshot.VerstorbenerName ?? "",
            ["verstorbenerVorname"] = snapshot.VerstorbenerVorname ?? "",
            ["verstorbenerNachname"] = snapshot.VerstorbenerNachname ?? "",
            ["sterbedatum"] = snapshot.Sterbedatum ?? "",
            ["sterbeort"] = snapshot.Sterbeort ?? "",
            ["quelleMaske"] = snapshot.QuelleMaske ?? "",
            ["erfassungsPhase"] = snapshot.ErfassungsPhase ?? "",
            ["istNeuerFall"] = snapshot.IstNeuerFall,
            ["erfassungSchluessel"] = snapshot.ErfassungSchluessel ?? "",
            ["abholort"] = snapshot.Abholort ?? "",
            ["abholortIstKrankenhaus"] = snapshot.AbholortIstKrankenhaus,
            ["bestattungsart"] = snapshot.Bestattungsart ?? "",
            ["endziel"] = snapshot.Endziel ?? "",
            ["endzielTyp"] = snapshot.EndzielTyp ?? "",
            ["kuehlplatz"] = inHistory ? "" : snapshot.Kuehlplatz ?? "",
            ["beisetzungsdatum"] = snapshot.BeisetzungsDatum ?? "",
            ["beisetzungszeit"] = snapshot.BeisetzungsZeit ?? "",
            ["trauerfeierdatum"] = snapshot.TrauerfeierDatum ?? "",
            ["trauerfeierzeit"] = snapshot.TrauerfeierZeit ?? "",
            ["trauerfeierort"] = snapshot.TrauerfeierOrt ?? "",
            ["trauerfeier2datum"] = snapshot.Trauerfeier2Datum ?? "",
            ["trauerfeier2zeit"] = snapshot.Trauerfeier2Zeit ?? "",
            ["trauerfeier2ort"] = snapshot.Trauerfeier2Ort ?? "",
            ["rosenkranzdatum"] = snapshot.RosenkranzDatum ?? "",
            ["rosenkranzzeit"] = snapshot.RosenkranzZeit ?? "",
            ["rosenkranzort"] = snapshot.RosenkranzOrt ?? "",
            ["imAnschluss"] = snapshot.ImAnschluss,
            ["inHistory"] = inHistory,
            ["aktivInDisposition"] = !inHistory,
            ["historieGrund"] = historieGrund,
            ["aktuellePosition"] = snapshot.AktuellePosition ?? "",
            ["aktuellePositionTyp"] = snapshot.AktuellePositionTyp ?? "",
            ["kuehlraumId"] = inHistory ? "" : kuehlraum,
            ["kuehlraumQuelle"] = "alamida_detail",
            ["status"] = status,
            ["naechsterSchrittAm"] = snapshot.NaechsterSchrittAm ?? "",
            ["naechsterSchrittVon"] = snapshot.NaechsterSchrittVon ?? "",
            ["naechsterSchrittNach"] = snapshot.NaechsterSchrittNach ?? "",
            ["naechsterSchrittTyp"] = snapshot.NaechsterSchrittTyp ?? "",
            ["naechsteUeberfuehrungAm"] = snapshot.NaechsterSchrittAm ?? "",
            ["naechsteUeberfuehrungVon"] = snapshot.NaechsterSchrittVon ?? "",
            ["naechsteUeberfuehrungNach"] = snapshot.NaechsterSchrittNach ?? "",
            ["verlauf"] = verlauf,
            ["ausstehend"] = ausstehend,
            ["contentHash"] = contentHash,
            ["workstationId"] = _workstationId,
            ["aktivInAlamida"] = true,
            ["lastSeenAt"] = now,
            ["updatedAt"] = now,
            ["erkanntAm"] = existing!.Exists && existing.ContainsField("erkanntAm")
                ? existing.GetValue<Timestamp>("erkanntAm")
                : now,
        };
        if (sichtbarBis != null)
            sterbefallData["sichtbarBis"] = sichtbarBis;
        if (inHistory)
            sterbefallData["archiviertAm"] = now;

        await sterbefallRef.SetAsync(sterbefallData, SetOptions.MergeAll, ct);

        if (inHistory)
            await ArchiveToHistoryFromDataAsync(sterbefallId, sterbefallData, snapshot, now, ct);

        var schritte = snapshot.Schritte.Count > 0
            ? snapshot.Schritte
            : new[]
            {
                new UeberfuehrungSchritt
                {
                    Zeile = 1,
                    SchrittTyp = "abholung",
                    VonOrt = snapshot.VonOrt,
                    NachOrt = snapshot.NachOrt,
                    TerminAm = snapshot.TerminAm,
                    Kuehlraum = snapshot.Kuehlraum,
                },
            };

        foreach (var schritt in schritte.Where(e => e.HasRoute))
        {
            var docId = $"{sterbefallId}-{schritt.Zeile}";
            var ueRef = _db.Collection("ueberfuehrungen").Document(docId);
            await ueRef.SetAsync(new Dictionary<string, object>
            {
                ["sterbefallId"] = sterbefallId,
                ["zeile"] = schritt.Zeile,
                ["schrittTyp"] = schritt.SchrittTyp,
                ["vonOrt"] = schritt.VonOrt ?? "",
                ["nachOrt"] = schritt.NachOrt ?? "",
                ["terminAm"] = schritt.TerminAm ?? "",
                ["abholungAm"] = schritt.TerminAm ?? "",
                ["kuehlraumId"] = schritt.Kuehlraum ?? kuehlraum,
                ["aktuellerStandort"] = schritt.NachOrt ?? schritt.VonOrt ?? "",
                ["workstationId"] = _workstationId,
                ["contentHash"] = contentHash,
                ["updatedAt"] = now,
            }, SetOptions.MergeAll, ct);
        }

        await _db.Collection("events").AddAsync(new Dictionary<string, object>
        {
            ["type"] = snapshot.IstNeuerFall ? "SterbefallNeuErfasst" : "SterbefallAktualisiert",
            ["sterbefallId"] = sterbefallId,
            ["kuehlraumId"] = kuehlraum,
            ["aktuellePosition"] = snapshot.AktuellePosition ?? "",
            ["schritteAnzahl"] = schritte.Count(e => e.HasRoute),
            ["workstationId"] = _workstationId,
            ["createdAt"] = now,
        }, ct);

        _cache.Save(
            sterbefallId,
            contentHash,
            SnapshotHasDispositionData(snapshot) || ExistingHasDispositionData(existing!),
            inHistory,
            fullWriteCompleted: true);

        return new SyncResult
        {
            Kind = SyncResultKind.Updated,
            SterbefallId = sterbefallId,
            SterbefallWechsel = sterbefallWechsel || !existing!.Exists,
        };
    }

    private async Task<SyncResult> SyncWithoutReadAsync(
        DetailSnapshot snapshot,
        string sterbefallId,
        DocumentReference sterbefallRef,
        string contentHash,
        SterbefallFirestoreCache.Entry? cached,
        bool sterbefallWechsel,
        Timestamp now,
        CancellationToken ct)
    {
        snapshot = MergeSnapshotWithCache(snapshot, cached);
        contentHash = snapshot.ContentHash();

        if (cached != null && cached.ContentHash == contentHash && cached.FullWriteCompleted)
        {
            if (!ShouldWriteHeartbeat(cached, sterbefallWechsel))
                return HeartbeatResult(sterbefallId, sterbefallWechsel, HeartbeatReason.Throttled);

            var inHistoryCached = ResolveInHistoryFromCache(snapshot, cached);
            if (ShouldOnlyTouchLastSeenFromCache(snapshot, cached))
            {
                await sterbefallRef.SetAsync(
                    BuildLastSeenPayload(sterbefallId, snapshot, _workstationId, now),
                    SetOptions.MergeAll,
                    ct);
                _cache.Save(sterbefallId, contentHash, cached.HasDispositionData, inHistoryCached, fullWriteCompleted: true);
                return HeartbeatResult(sterbefallId, sterbefallWechsel, HeartbeatReason.LastSeenOnly);
            }

            await sterbefallRef.SetAsync(
                BuildHeartbeatPayload(sterbefallId, snapshot, inHistoryCached, _workstationId, now),
                SetOptions.MergeAll,
                ct);
            _cache.Save(sterbefallId, contentHash, cached.HasDispositionData, inHistoryCached, fullWriteCompleted: true);
            return HeartbeatResult(sterbefallId, sterbefallWechsel, HeartbeatReason.ContentUnchanged);
        }

        var inHistory = ResolveInHistoryFromCache(snapshot, cached);
        var kuehlraum = snapshot.Kuehlraum ?? "";
        var status = ResolveStatus(inHistory, kuehlraum, snapshot.AktuellePositionTyp);
        var sterbefallData = BuildFullSterbefallData(
            sterbefallId, snapshot, contentHash, inHistory, status, kuehlraum, now, erkanntAm: now);

        await sterbefallRef.SetAsync(sterbefallData, SetOptions.MergeAll, ct);
        await WriteSchritteAndEventAsync(snapshot, sterbefallId, contentHash, kuehlraum, now, ct, writeEvent: true);

        _cache.Save(
            sterbefallId,
            contentHash,
            SnapshotHasDispositionData(snapshot) || (cached?.HasDispositionData ?? false),
            inHistory,
            fullWriteCompleted: true);

        return new SyncResult
        {
            Kind = SyncResultKind.Updated,
            SterbefallId = sterbefallId,
            SterbefallWechsel = sterbefallWechsel || cached == null,
        };
    }

    private static bool ShouldWriteHeartbeat(SterbefallFirestoreCache.Entry? cache, bool sterbefallWechsel)
    {
        if (sterbefallWechsel) return true;
        if (cache == null) return true;
        return DateTime.UtcNow - cache.LastSyncedUtc >= HeartbeatWriteInterval;
    }

    private static SyncResult HeartbeatResult(
        string sterbefallId,
        bool sterbefallWechsel,
        HeartbeatReason reason) =>
        new()
        {
            Kind = SyncResultKind.Heartbeat,
            HeartbeatReason = reason,
            SterbefallId = sterbefallId,
            SterbefallWechsel = sterbefallWechsel,
        };

    private static bool ShouldOnlyTouchLastSeenFromCache(
        DetailSnapshot snapshot,
        SterbefallFirestoreCache.Entry cache)
    {
        if (!cache.HasDispositionData) return false;
        if (snapshot.IsReliableDetailCapture) return false;
        if (string.Equals(snapshot.QuelleMaske, "neuer_sterbefall", StringComparison.Ordinal))
            return false;
        return true;
    }

    private static bool ResolveInHistoryFromCache(
        DetailSnapshot snapshot,
        SterbefallFirestoreCache.Entry? cache)
    {
        if (cache != null && cache.InHistory) return true;
        if (snapshot.IsDetailMaske) return snapshot.InHistory;
        return false;
    }

    private static bool SnapshotHasDispositionData(DetailSnapshot snapshot) =>
        !string.IsNullOrWhiteSpace(snapshot.Sterbeort) ||
        snapshot.AbholortIstKrankenhaus ||
        snapshot.Ausstehend.Count > 0 ||
        snapshot.Schritte.Count > 0;

    private static DetailSnapshot MergeSnapshotWithCache(
        DetailSnapshot snapshot,
        SterbefallFirestoreCache.Entry? cache)
    {
        if (cache == null || snapshot.IsReliableDetailCapture)
            return snapshot;

        var sterbeort = snapshot.Sterbeort;
        if (string.IsNullOrWhiteSpace(sterbeort) && cache.HasDispositionData)
            sterbeort = null;

        return snapshot;
    }

    private static bool ShouldOnlyTouchLastSeen(DetailSnapshot snapshot, DocumentSnapshot existing)
    {
        if (!existing.Exists) return false;
        if (snapshot.IsReliableDetailCapture) return false;
        if (string.Equals(snapshot.QuelleMaske, "neuer_sterbefall", StringComparison.Ordinal))
            return false;
        return ExistingHasDispositionData(existing);
    }

    private static bool ExistingHasDispositionData(DocumentSnapshot existing)
    {
        if (!string.IsNullOrWhiteSpace(FirestoreFieldHelpers.SafeString(existing, "sterbeort")))
            return true;
        if (FirestoreFieldHelpers.SafeBool(existing, "abholortIstKrankenhaus"))
            return true;
        if (FirestoreFieldHelpers.HasNonEmptyListField(existing, "ausstehend"))
            return true;
        return false;
    }

    private static readonly HashSet<string> ManuelleHistorieGruende = new(StringComparer.Ordinal)
    {
        "manuell_entfernt",
        "uebergabe_anderer_bestatter",
        "beisetzung_durch_dritte",
        "kremation_extern",
        "storniert",
        "sonstiges",
    };

    private static bool IsManuellerHistorieGrund(string? grund) =>
        !string.IsNullOrEmpty(grund) && ManuelleHistorieGruende.Contains(grund);

    private static bool ResolveInHistory(DetailSnapshot snapshot, DocumentSnapshot existing)
    {
        if (existing.Exists)
        {
            if (IsManuellerHistorieGrund(FirestoreFieldHelpers.SafeString(existing, "historieGrund")))
                return true;

            if (existing.ContainsField("inHistory"))
                return FirestoreFieldHelpers.SafeBool(existing, "inHistory");
        }

        if (snapshot.IsDetailMaske)
            return snapshot.InHistory;

        return false;
    }

    private static string ResolveHistorieGrund(DetailSnapshot snapshot, DocumentSnapshot existing, bool inHistory)
    {
        if (existing.Exists)
        {
            var existingGrund = FirestoreFieldHelpers.SafeString(existing, "historieGrund");
            if (IsManuellerHistorieGrund(existingGrund))
                return existingGrund!;
        }

        return inHistory ? snapshot.HistorieGrund ?? "" : snapshot.HistorieGrund ?? "";
    }

    private static Dictionary<string, object> BuildLastSeenPayload(
        string sterbefallId,
        DetailSnapshot snapshot,
        string workstationId,
        Timestamp now)
    {
        var payload = new Dictionary<string, object>
        {
            ["sterbefallId"] = sterbefallId,
            ["aktivInAlamida"] = true,
            ["lastSeenAt"] = now,
            ["updatedAt"] = now,
            ["workstationId"] = workstationId,
            ["verstorbenerName"] = snapshot.VerstorbenerName ?? "",
        };
        AddStringIfPresent(payload, "sterbeort", snapshot.Sterbeort);
        AddStringIfPresent(payload, "abholort", snapshot.Abholort);
        if (snapshot.Ausstehend.Count > 0)
            payload["ausstehend"] = BuildAusstehendPayload(snapshot.Ausstehend);
        return payload;
    }

    private static Dictionary<string, object> BuildHeartbeatPayload(
        string sterbefallId,
        DetailSnapshot snapshot,
        bool inHistory,
        string workstationId,
        Timestamp now)
    {
        var heartbeatKuehlraum = snapshot.Kuehlraum ?? "";
        var heartbeatStatus = ResolveStatus(inHistory, heartbeatKuehlraum, snapshot.AktuellePositionTyp);
        var payload = new Dictionary<string, object>
        {
            ["sterbefallId"] = sterbefallId,
            ["aktivInAlamida"] = true,
            ["aktivInDisposition"] = !inHistory,
            ["inHistory"] = inHistory,
            ["status"] = heartbeatStatus,
            ["lastSeenAt"] = now,
            ["updatedAt"] = now,
            ["workstationId"] = workstationId,
            ["quelleMaske"] = snapshot.QuelleMaske ?? "",
            ["erfassungsPhase"] = snapshot.ErfassungsPhase ?? "",
        };

        AddStringIfPresent(payload, "verstorbenerName", snapshot.VerstorbenerName);
        AddStringIfPresent(payload, "sterbeort", snapshot.Sterbeort);
        AddStringIfPresent(payload, "abholort", snapshot.Abholort);
        AddStringIfPresent(payload, "aktuellePosition", snapshot.AktuellePosition);
        AddStringIfPresent(payload, "aktuellePositionTyp", snapshot.AktuellePositionTyp);

        if (snapshot.AbholortIstKrankenhaus)
            payload["abholortIstKrankenhaus"] = true;

        if (!inHistory && !string.IsNullOrWhiteSpace(heartbeatKuehlraum))
            payload["kuehlraumId"] = heartbeatKuehlraum;

        if (!inHistory && !string.IsNullOrWhiteSpace(snapshot.Kuehlplatz))
            payload["kuehlplatz"] = snapshot.Kuehlplatz;

        if (snapshot.Ausstehend.Count > 0)
            payload["ausstehend"] = BuildAusstehendPayload(snapshot.Ausstehend);

        AddStringIfPresent(payload, "beisetzungsdatum", snapshot.BeisetzungsDatum);
        AddStringIfPresent(payload, "beisetzungszeit", snapshot.BeisetzungsZeit);
        AddStringIfPresent(payload, "trauerfeierdatum", snapshot.TrauerfeierDatum);
        AddStringIfPresent(payload, "trauerfeierzeit", snapshot.TrauerfeierZeit);
        AddStringIfPresent(payload, "trauerfeierort", snapshot.TrauerfeierOrt);
        AddStringIfPresent(payload, "trauerfeier2datum", snapshot.Trauerfeier2Datum);
        AddStringIfPresent(payload, "trauerfeier2zeit", snapshot.Trauerfeier2Zeit);
        AddStringIfPresent(payload, "trauerfeier2ort", snapshot.Trauerfeier2Ort);
        AddStringIfPresent(payload, "rosenkranzort", snapshot.RosenkranzOrt);
        if (snapshot.ImAnschluss)
            payload["imAnschluss"] = true;

        return payload;
    }

    private static DetailSnapshot MergeSnapshotWithExisting(
        DetailSnapshot snapshot,
        DocumentSnapshot existing)
    {
        if (!existing.Exists || snapshot.IsReliableDetailCapture)
            return snapshot;

        var sterbeort = snapshot.Sterbeort;
        if (string.IsNullOrWhiteSpace(sterbeort))
            sterbeort = FirestoreFieldHelpers.SafeString(existing, "sterbeort");

        var abholort = snapshot.Abholort;
        if (string.IsNullOrWhiteSpace(abholort))
            abholort = FirestoreFieldHelpers.SafeString(existing, "abholort");

        var abholortKh = snapshot.AbholortIstKrankenhaus;
        if (!abholortKh && existing.ContainsField("abholortIstKrankenhaus"))
            abholortKh = FirestoreFieldHelpers.SafeBool(existing, "abholortIstKrankenhaus");

        return snapshot with
        {
            Sterbeort = sterbeort,
            Abholort = abholort,
            AbholortIstKrankenhaus = abholortKh,
            BeisetzungsDatum = MergeTerminField(snapshot.BeisetzungsDatum, existing, "beisetzungsdatum"),
            BeisetzungsZeit = MergeTerminField(snapshot.BeisetzungsZeit, existing, "beisetzungszeit"),
            Endziel = MergeTerminField(snapshot.Endziel, existing, "endziel"),
            TrauerfeierDatum = MergeTerminField(snapshot.TrauerfeierDatum, existing, "trauerfeierdatum"),
            TrauerfeierZeit = MergeTerminField(snapshot.TrauerfeierZeit, existing, "trauerfeierzeit"),
            TrauerfeierOrt = MergeTerminField(snapshot.TrauerfeierOrt, existing, "trauerfeierort"),
            Trauerfeier2Datum = MergeTerminField(snapshot.Trauerfeier2Datum, existing, "trauerfeier2datum"),
            Trauerfeier2Zeit = MergeTerminField(snapshot.Trauerfeier2Zeit, existing, "trauerfeier2zeit"),
            Trauerfeier2Ort = MergeTerminField(snapshot.Trauerfeier2Ort, existing, "trauerfeier2ort"),
            RosenkranzDatum = MergeTerminField(snapshot.RosenkranzDatum, existing, "rosenkranzdatum"),
            RosenkranzZeit = MergeTerminField(snapshot.RosenkranzZeit, existing, "rosenkranzzeit"),
            RosenkranzOrt = MergeTerminField(snapshot.RosenkranzOrt, existing, "rosenkranzort"),
        };
    }

    /// <summary>Termine bei unvollständiger Masken-Erfassung nicht mit Leerwerten überschreiben.</summary>
    private static string? MergeTerminField(string? incoming, DocumentSnapshot existing, string field) =>
        string.IsNullOrWhiteSpace(incoming)
            ? FirestoreFieldHelpers.SafeString(existing, field)
            : incoming.Trim();

    private static void AddStringIfPresent(
        Dictionary<string, object> payload,
        string key,
        string? value)
    {
        if (!string.IsNullOrWhiteSpace(value))
            payload[key] = value.Trim();
    }

    private static string ResolveStatus(bool inHistory, string kuehlraum, string? aktuellePositionTyp) =>
        inHistory
            ? "archiviert"
            : !string.IsNullOrWhiteSpace(kuehlraum) && aktuellePositionTyp != "sterbeort"
                ? "im_kuehlraum"
                : "unterwegs";

    private static List<Dictionary<string, object>> BuildAusstehendPayload(
        IReadOnlyList<AusstehendeUeberfuehrung> eintraege) =>
        eintraege.Select(a => new Dictionary<string, object>
        {
            ["zeile"] = a.Zeile,
            ["schrittTyp"] = a.SchrittTyp,
            ["vonOrt"] = a.VonOrt ?? "",
            ["nachOrt"] = a.NachOrt ?? "",
            ["terminAm"] = a.TerminAm ?? "",
            ["abholungAm"] = a.TerminAm ?? "",
            ["status"] = a.Status,
            ["istAbholungVomSterbeort"] = a.IstAbholungVomSterbeort,
        }).ToList();

    private static string ResolveSterbefallDocumentId(DetailSnapshot snapshot)
    {
        if (!string.IsNullOrWhiteSpace(snapshot.SterbefallId))
            return FirestoreFieldHelpers.SanitizeDocumentId(snapshot.SterbefallId);

        if (!string.IsNullOrWhiteSpace(snapshot.ErfassungSchluessel))
            return FirestoreFieldHelpers.SanitizeDocumentId(
                DokumentIdAusSchluessel(snapshot.ErfassungSchluessel));

        if (!string.IsNullOrWhiteSpace(snapshot.VerstorbenerName))
            return FirestoreFieldHelpers.SanitizeDocumentId(
                DokumentIdAusSchluessel(snapshot.VerstorbenerName));

        return FirestoreFieldHelpers.SanitizeDocumentId($"NEU-{Guid.NewGuid():N}"[..16]);
    }

    private static string DokumentIdAusSchluessel(string schluessel)
    {
        var hash = SHA256.HashData(Encoding.UTF8.GetBytes(schluessel.Trim()));
        return $"NEU-{Convert.ToHexString(hash)[..12]}";
    }

    private Task ArchiveToHistoryFromSnapshotAsync(
        string sterbefallId,
        DetailSnapshot snapshot,
        Timestamp now,
        CancellationToken ct)
    {
        var data = new Dictionary<string, object>
        {
            ["sterbefallId"] = sterbefallId,
            ["verstorbenerName"] = snapshot.VerstorbenerName ?? "",
            ["inHistory"] = true,
            ["archiviertAm"] = now,
            ["historieGrund"] = snapshot.HistorieGrund ?? "beisetzung",
        };
        if (snapshot.SichtbarBis.HasValue)
            data["sichtbarBis"] = Timestamp.FromDateTime(snapshot.SichtbarBis.Value.ToUniversalTime());

        return _db.Collection("sterbefaelle_history").Document(sterbefallId)
            .SetAsync(data, SetOptions.MergeAll, ct);
    }

    private Task ArchiveToHistoryFromDataAsync(
        string sterbefallId,
        Dictionary<string, object> sterbefallData,
        DetailSnapshot snapshot,
        Timestamp now,
        CancellationToken ct)
    {
        var data = new Dictionary<string, object>(sterbefallData)
        {
            ["sterbefallId"] = sterbefallId,
            ["verstorbenerName"] = snapshot.VerstorbenerName ?? "",
            ["inHistory"] = true,
            ["archiviertAm"] = now,
            ["historieGrund"] = snapshot.HistorieGrund ?? "beisetzung",
        };
        if (snapshot.SichtbarBis.HasValue)
            data["sichtbarBis"] = Timestamp.FromDateTime(snapshot.SichtbarBis.Value.ToUniversalTime());

        return _db.Collection("sterbefaelle_history").Document(sterbefallId)
            .SetAsync(data, SetOptions.MergeAll, ct);
    }

    private Dictionary<string, object> BuildFullSterbefallData(
        string sterbefallId,
        DetailSnapshot snapshot,
        string contentHash,
        bool inHistory,
        string status,
        string kuehlraum,
        Timestamp now,
        Timestamp erkanntAm)
    {
        var verlauf = snapshot.Verlauf.Select(v => new Dictionary<string, object>
        {
            ["nummer"] = v.Nummer,
            ["typ"] = v.Typ,
            ["ort"] = v.Ort ?? "",
            ["vonOrt"] = v.VonOrt ?? "",
            ["nachOrt"] = v.NachOrt ?? "",
            ["terminAm"] = v.TerminAm ?? "",
            ["abholungAm"] = v.TerminAm ?? "",
            ["kuehlraum"] = v.Kuehlraum ?? "",
        }).ToList();

        Timestamp? sichtbarBis = snapshot.SichtbarBis.HasValue
            ? Timestamp.FromDateTime(snapshot.SichtbarBis.Value.ToUniversalTime())
            : null;

        var data = new Dictionary<string, object>
        {
            ["sterbefallId"] = sterbefallId,
            ["verstorbenerName"] = snapshot.VerstorbenerName ?? "",
            ["verstorbenerVorname"] = snapshot.VerstorbenerVorname ?? "",
            ["verstorbenerNachname"] = snapshot.VerstorbenerNachname ?? "",
            ["sterbedatum"] = snapshot.Sterbedatum ?? "",
            ["sterbeort"] = snapshot.Sterbeort ?? "",
            ["quelleMaske"] = snapshot.QuelleMaske ?? "",
            ["erfassungsPhase"] = snapshot.ErfassungsPhase ?? "",
            ["istNeuerFall"] = snapshot.IstNeuerFall,
            ["erfassungSchluessel"] = snapshot.ErfassungSchluessel ?? "",
            ["abholort"] = snapshot.Abholort ?? "",
            ["abholortIstKrankenhaus"] = snapshot.AbholortIstKrankenhaus,
            ["bestattungsart"] = snapshot.Bestattungsart ?? "",
            ["endziel"] = snapshot.Endziel ?? "",
            ["endzielTyp"] = snapshot.EndzielTyp ?? "",
            ["kuehlplatz"] = inHistory ? "" : snapshot.Kuehlplatz ?? "",
            ["beisetzungsdatum"] = snapshot.BeisetzungsDatum ?? "",
            ["beisetzungszeit"] = snapshot.BeisetzungsZeit ?? "",
            ["trauerfeierdatum"] = snapshot.TrauerfeierDatum ?? "",
            ["trauerfeierzeit"] = snapshot.TrauerfeierZeit ?? "",
            ["trauerfeierort"] = snapshot.TrauerfeierOrt ?? "",
            ["trauerfeier2datum"] = snapshot.Trauerfeier2Datum ?? "",
            ["trauerfeier2zeit"] = snapshot.Trauerfeier2Zeit ?? "",
            ["trauerfeier2ort"] = snapshot.Trauerfeier2Ort ?? "",
            ["rosenkranzdatum"] = snapshot.RosenkranzDatum ?? "",
            ["rosenkranzzeit"] = snapshot.RosenkranzZeit ?? "",
            ["rosenkranzort"] = snapshot.RosenkranzOrt ?? "",
            ["imAnschluss"] = snapshot.ImAnschluss,
            ["inHistory"] = inHistory,
            ["aktivInDisposition"] = !inHistory,
            ["historieGrund"] = snapshot.HistorieGrund ?? "",
            ["aktuellePosition"] = snapshot.AktuellePosition ?? "",
            ["aktuellePositionTyp"] = snapshot.AktuellePositionTyp ?? "",
            ["kuehlraumId"] = inHistory ? "" : kuehlraum,
            ["kuehlraumQuelle"] = "alamida_detail",
            ["status"] = status,
            ["naechsterSchrittAm"] = snapshot.NaechsterSchrittAm ?? "",
            ["naechsterSchrittVon"] = snapshot.NaechsterSchrittVon ?? "",
            ["naechsterSchrittNach"] = snapshot.NaechsterSchrittNach ?? "",
            ["naechsterSchrittTyp"] = snapshot.NaechsterSchrittTyp ?? "",
            ["naechsteUeberfuehrungAm"] = snapshot.NaechsterSchrittAm ?? "",
            ["naechsteUeberfuehrungVon"] = snapshot.NaechsterSchrittVon ?? "",
            ["naechsteUeberfuehrungNach"] = snapshot.NaechsterSchrittNach ?? "",
            ["verlauf"] = verlauf,
            ["ausstehend"] = BuildAusstehendPayload(snapshot.Ausstehend),
            ["contentHash"] = contentHash,
            ["workstationId"] = _workstationId,
            ["aktivInAlamida"] = true,
            ["lastSeenAt"] = now,
            ["updatedAt"] = now,
            ["erkanntAm"] = erkanntAm,
        };
        if (sichtbarBis != null)
            data["sichtbarBis"] = sichtbarBis;
        if (inHistory)
            data["archiviertAm"] = now;
        return data;
    }

    private async Task WriteSchritteAndEventAsync(
        DetailSnapshot snapshot,
        string sterbefallId,
        string contentHash,
        string kuehlraum,
        Timestamp now,
        CancellationToken ct,
        bool writeEvent)
    {
        var schritte = snapshot.Schritte.Count > 0
            ? snapshot.Schritte
            : new[]
            {
                new UeberfuehrungSchritt
                {
                    Zeile = 1,
                    SchrittTyp = "abholung",
                    VonOrt = snapshot.VonOrt,
                    NachOrt = snapshot.NachOrt,
                    TerminAm = snapshot.TerminAm,
                    Kuehlraum = snapshot.Kuehlraum,
                },
            };

        foreach (var schritt in schritte.Where(e => e.HasRoute))
        {
            var docId = $"{sterbefallId}-{schritt.Zeile}";
            var ueRef = _db.Collection("ueberfuehrungen").Document(docId);
            await ueRef.SetAsync(new Dictionary<string, object>
            {
                ["sterbefallId"] = sterbefallId,
                ["zeile"] = schritt.Zeile,
                ["schrittTyp"] = schritt.SchrittTyp,
                ["vonOrt"] = schritt.VonOrt ?? "",
                ["nachOrt"] = schritt.NachOrt ?? "",
                ["terminAm"] = schritt.TerminAm ?? "",
                ["abholungAm"] = schritt.TerminAm ?? "",
                ["kuehlraumId"] = schritt.Kuehlraum ?? kuehlraum,
                ["aktuellerStandort"] = schritt.NachOrt ?? schritt.VonOrt ?? "",
                ["workstationId"] = _workstationId,
                ["contentHash"] = contentHash,
                ["updatedAt"] = now,
            }, SetOptions.MergeAll, ct);
        }

        if (!writeEvent) return;

        await _db.Collection("events").AddAsync(new Dictionary<string, object>
        {
            ["type"] = snapshot.IstNeuerFall ? "SterbefallNeuErfasst" : "SterbefallAktualisiert",
            ["sterbefallId"] = sterbefallId,
            ["kuehlraumId"] = kuehlraum,
            ["aktuellePosition"] = snapshot.AktuellePosition ?? "",
            ["schritteAnzahl"] = schritte.Count(e => e.HasRoute),
            ["workstationId"] = _workstationId,
            ["createdAt"] = now,
        }, ct);
    }

    public async Task MarkSterbefallInactiveAsync(string sterbefallId, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(sterbefallId)) return;

        var now = Timestamp.FromDateTime(DateTime.UtcNow);
        await _db.Collection("sterbefaelle").Document(sterbefallId.Trim()).SetAsync(
            new Dictionary<string, object>
            {
                ["aktivInAlamida"] = false,
                ["aktivBis"] = now,
                ["workstationId"] = _workstationId,
            },
            SetOptions.MergeAll,
            ct);
    }

    public ValueTask DisposeAsync() => ValueTask.CompletedTask;
}
