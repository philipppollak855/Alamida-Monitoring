namespace Alamida.Monitoring.Core.Firestore;

public enum SyncResultKind
{
    Skipped,
    Heartbeat,
    Updated,
}

/// <summary>Warum nur Heartbeat — für Tray/Wand-Diagnose.</summary>
public enum HeartbeatReason
{
    None,
    /// <summary>Nur lastSeenAt/Name — keine Detailmaske mit Terminen.</summary>
    LastSeenOnly,
    /// <summary>Inhalt unverändert (contentHash gleich).</summary>
    ContentUnchanged,
    /// <summary>Heartbeat-Firestore-Write gedrosselt (weniger Lese-Last in Clients).</summary>
    Throttled,
}

public readonly struct SyncResult
{
    public SyncResultKind Kind { get; init; }
    public HeartbeatReason HeartbeatReason { get; init; }
    public string? SterbefallId { get; init; }
    public bool SterbefallWechsel { get; init; }

    public static SyncResult Skipped() => new() { Kind = SyncResultKind.Skipped };

    public string FormatTrayStatus(
        string id,
        string maskeLabel = "Detail",
        bool fallWechsel = false,
        bool istNeuerFall = false) =>
        Kind switch
        {
            SyncResultKind.Skipped => "Keine Daten — Alamida-Fenster prüfen",
            SyncResultKind.Updated when istNeuerFall => $"Neu erfasst ({maskeLabel}) — {id}",
            SyncResultKind.Updated when fallWechsel => $"Neuer Fall ({maskeLabel}) — {id}",
            SyncResultKind.Updated => $"Aktualisiert ({maskeLabel}) — {id}",
            SyncResultKind.Heartbeat when HeartbeatReason == HeartbeatReason.LastSeenOnly =>
                $"Nur Lebenszeichen ({maskeLabel}) — Detail/Termine öffnen — {id}",
            SyncResultKind.Heartbeat when fallWechsel => $"Fall aktiv ({maskeLabel}) — {id}",
            SyncResultKind.Heartbeat => $"Live unverändert ({maskeLabel}) — {id}",
            _ => $"Live ({maskeLabel}) — {id}",
        };

    public string FormatSyncLogLine(string id, int schrittCount) =>
        Kind switch
        {
            SyncResultKind.Skipped => "Kein Sync — keine Mindestdaten",
            SyncResultKind.Updated =>
                $"Firestore vollständig aktualisiert — {id} ({schrittCount} Schritte)",
            SyncResultKind.Heartbeat when HeartbeatReason == HeartbeatReason.LastSeenOnly =>
                $"Firestore verbunden, nur Lebenszeichen — {id} (Wand: Detail/Termine in Alamida öffnen)",
            SyncResultKind.Heartbeat =>
                $"Firestore verbunden, Daten unverändert — {id} ({schrittCount} Schritte)",
            _ => $"Firestore — {id}",
        };
}
