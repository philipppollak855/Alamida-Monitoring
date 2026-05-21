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

    public async Task SyncSnapshotAsync(DetailSnapshot snapshot, CancellationToken ct = default)
    {
        if (!snapshot.HasMinimumData)
            return;

        var sterbefallId = snapshot.SterbefallId?.Trim()
            ?? snapshot.VerstorbenerName?.Trim()
            ?? Guid.NewGuid().ToString("N")[..12];

        var now = Timestamp.FromDateTime(DateTime.UtcNow);
        var status = string.IsNullOrWhiteSpace(snapshot.Kuehlraum) ? "unterwegs" : "im_kuehlraum";

        var sterbefallRef = _db.Collection("sterbefaelle").Document(sterbefallId);
        await sterbefallRef.SetAsync(new Dictionary<string, object>
        {
            ["sterbefallId"] = sterbefallId,
            ["verstorbenerName"] = snapshot.VerstorbenerName ?? "",
            ["kuehlraumId"] = snapshot.Kuehlraum ?? "",
            ["kuehlraumQuelle"] = "alamida_detail",
            ["status"] = status,
            ["workstationId"] = _workstationId,
            ["updatedAt"] = now,
            ["erkanntAm"] = now,
        }, SetOptions.MergeAll, ct);

        var ueberfuehrungRef = _db.Collection("ueberfuehrungen").Document(sterbefallId);
        await ueberfuehrungRef.SetAsync(new Dictionary<string, object>
        {
            ["sterbefallId"] = sterbefallId,
            ["vonOrt"] = snapshot.VonOrt ?? "",
            ["nachOrt"] = snapshot.NachOrt ?? "",
            ["abholungAm"] = snapshot.AbholungAm ?? "",
            ["kuehlraumId"] = snapshot.Kuehlraum ?? "",
            ["aktuellerStandort"] = snapshot.Kuehlraum ?? snapshot.NachOrt ?? snapshot.VonOrt ?? "",
            ["workstationId"] = _workstationId,
            ["updatedAt"] = now,
            ["erkanntAm"] = now,
        }, SetOptions.MergeAll, ct);

        await _db.Collection("events").AddAsync(new Dictionary<string, object>
        {
            ["type"] = "UeberfuehrungErfasst",
            ["sterbefallId"] = sterbefallId,
            ["kuehlraumId"] = snapshot.Kuehlraum ?? "",
            ["workstationId"] = _workstationId,
            ["createdAt"] = now,
        }, ct);
    }

    public ValueTask DisposeAsync() => ValueTask.CompletedTask;
}
