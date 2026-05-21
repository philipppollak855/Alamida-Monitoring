namespace Alamida.Monitoring.Core.Firestore;

public enum SyncResultKind
{
    Skipped,
    Heartbeat,
    Updated,
}

public readonly struct SyncResult
{
    public SyncResultKind Kind { get; init; }
    public string? SterbefallId { get; init; }
    public bool SterbefallWechsel { get; init; }

    public static SyncResult Skipped() => new() { Kind = SyncResultKind.Skipped };
}
