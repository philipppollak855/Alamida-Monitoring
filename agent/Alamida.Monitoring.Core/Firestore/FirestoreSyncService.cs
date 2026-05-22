using System.Security.Cryptography;
using System.Text;
using Alamida.Monitoring.Core.Models;
using Google.Cloud.Firestore;

namespace Alamida.Monitoring.Core.Firestore;

public sealed class FirestoreSyncService : IAsyncDisposable
{
    private readonly FirestoreDb _db;
    private readonly string _workstationId;

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
        var existing = await sterbefallRef.GetSnapshotAsync(ct);
        var oldHash = existing.Exists && existing.ContainsField("contentHash")
            ? existing.GetValue<string>("contentHash")
            : null;
        var now = Timestamp.FromDateTime(DateTime.UtcNow);

        if (ShouldOnlyTouchLastSeen(snapshot, existing))
        {
            await sterbefallRef.SetAsync(
                BuildLastSeenPayload(sterbefallId, snapshot, _workstationId, now),
                SetOptions.MergeAll,
                ct);
            return new SyncResult
            {
                Kind = SyncResultKind.Heartbeat,
                HeartbeatReason = HeartbeatReason.LastSeenOnly,
                SterbefallId = sterbefallId,
                SterbefallWechsel = sterbefallWechsel,
            };
        }

        snapshot = MergeSnapshotWithExisting(snapshot, existing);
        contentHash = snapshot.ContentHash();
        oldHash = existing.Exists && existing.ContainsField("contentHash")
            ? existing.GetValue<string>("contentHash")
            : null;

        var inHistory = ResolveInHistory(snapshot, existing);
        Timestamp? sichtbarBis = snapshot.SichtbarBis.HasValue
            ? Timestamp.FromDateTime(snapshot.SichtbarBis.Value.ToUniversalTime())
            : null;

        if (oldHash == contentHash)
        {
            await sterbefallRef.SetAsync(
                BuildHeartbeatPayload(sterbefallId, snapshot, inHistory, _workstationId, now),
                SetOptions.MergeAll,
                ct);

            if (inHistory)
                await ArchiveToHistoryAsync(sterbefallRef, sterbefallId, snapshot, now, ct);

            return new SyncResult
            {
                Kind = SyncResultKind.Heartbeat,
                HeartbeatReason = HeartbeatReason.ContentUnchanged,
                SterbefallId = sterbefallId,
                SterbefallWechsel = sterbefallWechsel,
            };
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
            ["trauerfeier2datum"] = snapshot.Trauerfeier2Datum ?? "",
            ["trauerfeier2zeit"] = snapshot.Trauerfeier2Zeit ?? "",
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
            ["ausstehend"] = ausstehend,
            ["contentHash"] = contentHash,
            ["workstationId"] = _workstationId,
            ["aktivInAlamida"] = true,
            ["lastSeenAt"] = now,
            ["updatedAt"] = now,
            ["erkanntAm"] = existing.Exists && existing.ContainsField("erkanntAm")
                ? existing.GetValue<Timestamp>("erkanntAm")
                : now,
        };
        if (sichtbarBis != null)
            sterbefallData["sichtbarBis"] = sichtbarBis;
        if (inHistory)
            sterbefallData["archiviertAm"] = now;

        await sterbefallRef.SetAsync(sterbefallData, SetOptions.MergeAll, ct);

        if (inHistory)
            await ArchiveToHistoryAsync(sterbefallRef, sterbefallId, snapshot, now, ct);

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

        return new SyncResult
        {
            Kind = SyncResultKind.Updated,
            SterbefallId = sterbefallId,
            SterbefallWechsel = sterbefallWechsel || !existing.Exists,
        };
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
        if (!string.IsNullOrWhiteSpace(existing.GetValue<string>("sterbeort")))
            return true;
        if (existing.ContainsField("abholortIstKrankenhaus") && existing.GetValue<bool>("abholortIstKrankenhaus"))
            return true;
        if (existing.ContainsField("ausstehend") &&
            existing.GetValue<List<object>>("ausstehend") is { Count: > 0 })
            return true;
        return false;
    }

    private const string ManuellEntferntGrund = "manuell_entfernt";

    private static bool ResolveInHistory(DetailSnapshot snapshot, DocumentSnapshot existing)
    {
        if (existing.Exists)
        {
            if (existing.ContainsField("historieGrund")
                && existing.GetValue<string>("historieGrund") == ManuellEntferntGrund)
                return true;

            if (existing.ContainsField("inHistory"))
                return existing.GetValue<bool>("inHistory");
        }

        if (snapshot.IsDetailMaske)
            return snapshot.InHistory;

        return false;
    }

    private static Dictionary<string, object> BuildLastSeenPayload(
        string sterbefallId,
        DetailSnapshot snapshot,
        string workstationId,
        Timestamp now) =>
        new()
        {
            ["sterbefallId"] = sterbefallId,
            ["aktivInAlamida"] = true,
            ["lastSeenAt"] = now,
            ["workstationId"] = workstationId,
            ["verstorbenerName"] = snapshot.VerstorbenerName ?? "",
        };

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

        return payload;
    }

    private static DetailSnapshot MergeSnapshotWithExisting(
        DetailSnapshot snapshot,
        DocumentSnapshot existing)
    {
        if (!existing.Exists || snapshot.IsReliableDetailCapture)
            return snapshot;

        var sterbeort = snapshot.Sterbeort;
        if (string.IsNullOrWhiteSpace(sterbeort) && existing.ContainsField("sterbeort"))
            sterbeort = existing.GetValue<string>("sterbeort");

        var abholort = snapshot.Abholort;
        if (string.IsNullOrWhiteSpace(abholort) && existing.ContainsField("abholort"))
            abholort = existing.GetValue<string>("abholort");

        var abholortKh = snapshot.AbholortIstKrankenhaus;
        if (!abholortKh && existing.ContainsField("abholortIstKrankenhaus"))
            abholortKh = existing.GetValue<bool>("abholortIstKrankenhaus");

        return snapshot with
        {
            Sterbeort = sterbeort,
            Abholort = abholort,
            AbholortIstKrankenhaus = abholortKh,
        };
    }

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
            return snapshot.SterbefallId.Trim();

        if (!string.IsNullOrWhiteSpace(snapshot.ErfassungSchluessel))
            return DokumentIdAusSchluessel(snapshot.ErfassungSchluessel);

        if (!string.IsNullOrWhiteSpace(snapshot.VerstorbenerName))
            return DokumentIdAusSchluessel(snapshot.VerstorbenerName);

        return $"NEU-{Guid.NewGuid():N}"[..16];
    }

    private static string DokumentIdAusSchluessel(string schluessel)
    {
        var hash = SHA256.HashData(Encoding.UTF8.GetBytes(schluessel.Trim()));
        return $"NEU-{Convert.ToHexString(hash)[..12]}";
    }

    private async Task ArchiveToHistoryAsync(
        DocumentReference sterbefallRef,
        string sterbefallId,
        DetailSnapshot snapshot,
        Timestamp now,
        CancellationToken ct)
    {
        var snap = await sterbefallRef.GetSnapshotAsync(ct);
        var data = snap.Exists
            ? new Dictionary<string, object>(snap.ToDictionary())
            : new Dictionary<string, object>();

        data["sterbefallId"] = sterbefallId;
        data["verstorbenerName"] = snapshot.VerstorbenerName ?? "";
        data["inHistory"] = true;
        data["archiviertAm"] = now;
        data["historieGrund"] = snapshot.HistorieGrund ?? "beisetzung";
        if (snapshot.SichtbarBis.HasValue)
            data["sichtbarBis"] = Timestamp.FromDateTime(snapshot.SichtbarBis.Value.ToUniversalTime());

        await _db.Collection("sterbefaelle_history").Document(sterbefallId).SetAsync(data, SetOptions.MergeAll, ct);
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
