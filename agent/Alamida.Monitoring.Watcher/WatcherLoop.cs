using Alamida.Monitoring.Core.Firestore;
using Alamida.Monitoring.Core.Models;
using Alamida.Monitoring.Profiles;

namespace Alamida.Monitoring.Watcher;

public sealed class WatcherLoop
{
    private readonly DetailMaskWatcher _watcher;
    private readonly FirestoreSyncService? _firestore;
    private readonly OfflineQueue _offlineQueue = new();
    private readonly int _pollIntervalMs;
    private CancellationTokenSource? _cts;

    public event Action<string>? StatusChanged;
    public event Action<Exception>? ErrorOccurred;

    public WatcherLoop(
        FieldMappingProfile profile,
        FirestoreSyncService? firestore,
        int pollIntervalMs)
    {
        _watcher = new DetailMaskWatcher(profile);
        _firestore = firestore;
        _pollIntervalMs = pollIntervalMs;
    }

    public void Start()
    {
        Stop();
        _cts = new CancellationTokenSource();
        _ = RunAsync(_cts.Token);
    }

    public void Stop() => _cts?.Cancel();

    private async Task RunAsync(CancellationToken ct)
    {
        StatusChanged?.Invoke("Watcher aktiv");

        while (!ct.IsCancellationRequested)
        {
            try
            {
                var snapshot = _watcher.TryCaptureSnapshot();
                if (snapshot == null)
                {
                    StatusChanged?.Invoke("Alamida nicht gefunden");
                }
                else if (_watcher.HasChanged(snapshot))
                {
                    if (_firestore != null)
                    {
                        try
                        {
                            await _offlineQueue.FlushAsync(_firestore, ct);
                            await _firestore.SyncSnapshotAsync(snapshot, ct);
                            StatusChanged?.Invoke($"Sync OK — {snapshot.SterbefallId ?? snapshot.VerstorbenerName}");
                        }
                        catch (Exception syncEx)
                        {
                            _offlineQueue.Enqueue(snapshot);
                            ErrorOccurred?.Invoke(syncEx);
                            StatusChanged?.Invoke($"Queue offline — {snapshot.SterbefallId}");
                        }
                    }
                    else
                    {
                        _offlineQueue.Enqueue(snapshot);
                        StatusChanged?.Invoke($"Erfasst (offline) — {snapshot.Kuehlraum}");
                    }
                }
                else
                {
                    StatusChanged?.Invoke("Beobachte Detailmaske…");
                }
            }
            catch (Exception ex)
            {
                ErrorOccurred?.Invoke(ex);
                StatusChanged?.Invoke($"Fehler: {ex.Message}");
            }

            await Task.Delay(_pollIntervalMs, ct);
        }
    }
}
