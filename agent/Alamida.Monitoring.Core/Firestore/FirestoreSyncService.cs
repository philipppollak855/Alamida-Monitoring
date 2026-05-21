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

        if (oldHash == contentHash)
        {
            await sterbefallRef.SetAsync(new Dictionary<string, object>
            {
                ["sterbefallId"] = sterbefallId,
                ["aktivInAlamida"] = true,
                ["lastSeenAt"] = now,
                ["workstationId"] = _workstationId,
                ["verstorbenerName"] = snapshot.VerstorbenerName ?? "",
                ["aktuellePosition"] = snapshot.AktuellePosition ?? "",
                ["quelleMaske"] = snapshot.QuelleMaske ?? "",
                ["erfassungsPhase"] = snapshot.ErfassungsPhase ?? "",
            }, SetOptions.MergeAll, ct);

            return new SyncResult
            {
                Kind = SyncResultKind.Heartbeat,
                SterbefallId = sterbefallId,
                SterbefallWechsel = sterbefallWechsel,
            };
        }
        var kuehlraum = snapshot.Kuehlraum ?? "";
        var status = string.IsNullOrWhiteSpace(kuehlraum) ? "unterwegs" : "im_kuehlraum";

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

        var ausstehend = snapshot.Ausstehend.Select(a => new Dictionary<string, object>
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

        await sterbefallRef.SetAsync(new Dictionary<string, object>
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
            ["kuehlplatz"] = snapshot.Kuehlplatz ?? "",
            ["aktuellePosition"] = snapshot.AktuellePosition ?? "",
            ["aktuellePositionTyp"] = snapshot.AktuellePositionTyp ?? "",
            ["kuehlraumId"] = kuehlraum,
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
        }, SetOptions.MergeAll, ct);

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
