using Alamida.Monitoring.Core.Firestore;
using Alamida.Monitoring.Core.Models;
using Alamida.Monitoring.Profiles;

namespace Alamida.Monitoring.Watcher;

public sealed class WatcherLoop
{
    private readonly AlamidaMaskWatcher _watcher;
    private readonly FirestoreSyncService? _firestore;
    private readonly OfflineQueue _offlineQueue = new();
    private readonly SterbefallTracker _tracker = new();
    private readonly int _pollIntervalMs;
    private CancellationTokenSource? _cts;
    private volatile bool _paused;
    private string _lastStatus = "Bereit";

    public event Action<string>? StatusChanged;
    public event Action<Exception>? ErrorOccurred;

    public bool IsRunning => _cts != null && !_cts.IsCancellationRequested;
    public bool IsPaused => _paused;
    public string LastStatus => _lastStatus;

    public WatcherLoop(
        FieldMappingProfile profile,
        FirestoreSyncService? firestore,
        int pollIntervalMs)
    {
        _watcher = new AlamidaMaskWatcher(profile);
        _firestore = firestore;
        _pollIntervalMs = Math.Max(500, pollIntervalMs);
    }

    public void Start()
    {
        Stop();
        _cts = new CancellationTokenSource();
        _ = RunAsync(_cts.Token);
    }

    public void Stop()
    {
        _cts?.Cancel();
        _paused = false;
    }

    public void Pause()
    {
        _paused = true;
        SetStatus("Pausiert — kein Sync");
    }

    public void Resume()
    {
        if (!_paused) return;
        _paused = false;
        SetStatus("Watcher aktiv — Detail + Neuer Sterbefall");
    }

    public void Restart()
    {
        Stop();
        _tracker.Clear();
        Thread.Sleep(300);
        Start();
    }

    public async Task<bool> SyncOnceAsync(CancellationToken ct = default)
    {
        if (_firestore == null)
        {
            SetStatus("Sync nicht möglich — Firestore offline");
            return false;
        }

        var snapshot = _watcher.TryCaptureSnapshot();
        if (snapshot == null || !snapshot.HasMinimumData)
        {
            SetStatus("Sync — Alamida/Maske nicht erkannt");
            return false;
        }

        try
        {
            await _offlineQueue.FlushAsync(_firestore, ct);
            var (fallWechsel, vorherigerFall) = _tracker.Register(snapshot);
            if (fallWechsel && !string.IsNullOrWhiteSpace(vorherigerFall))
                await _firestore.MarkSterbefallInactiveAsync(vorherigerFall, ct);

            var result = await _firestore.SyncSnapshotAsync(snapshot, fallWechsel, ct);
            var id = result.SterbefallId ?? SterbefallTracker.Schluessel(snapshot) ?? "?";
            SetStatus(result.Kind == SyncResultKind.Updated
                ? $"Manuell aktualisiert — {id}"
                : $"Manuell (Live) — {id}");
            return true;
        }
        catch (Exception ex)
        {
            _offlineQueue.Enqueue(snapshot);
            ErrorOccurred?.Invoke(ex);
            SetStatus($"Sync-Fehler — {ex.Message}");
            return false;
        }
    }

    private void SetStatus(string status)
    {
        _lastStatus = status;
        StatusChanged?.Invoke(status);
    }

    private async Task RunAsync(CancellationToken ct)
    {
        SetStatus("Watcher aktiv — Detail + Neuer Sterbefall");

        while (!ct.IsCancellationRequested)
        {
            while (_paused && !ct.IsCancellationRequested)
                await Task.Delay(400, ct);

            var sofortWeiter = false;
            try
            {
                var snapshot = _watcher.TryCaptureSnapshot();
                if (snapshot == null || !snapshot.HasMinimumData)
                {
                    _tracker.Clear();
                    var maske = _watcher.LetzteErkannteMaske;
                    SetStatus(maske == MaskKind.Unbekannt
                        ? "Alamida/Maske nicht erkannt"
                        : $"Maske {maske} — noch keine Daten");
                }
                else
                {
                    var (fallWechsel, vorherigerFall) = _tracker.Register(snapshot);
                    if (fallWechsel)
                        sofortWeiter = true;

                    if (_firestore != null)
                    {
                        try
                        {
                            await _offlineQueue.FlushAsync(_firestore, ct);

                            if (fallWechsel && !string.IsNullOrWhiteSpace(vorherigerFall))
                                await _firestore.MarkSterbefallInactiveAsync(vorherigerFall, ct);

                            var result = await _firestore.SyncSnapshotAsync(snapshot, fallWechsel, ct);
                            var id = result.SterbefallId
                                ?? SterbefallTracker.Schluessel(snapshot)
                                ?? "?";
                            var maskeLabel = snapshot.QuelleMaske == "neuer_sterbefall"
                                ? "Neuer Sterbefall"
                                : "Detail";

                            SetStatus(result.Kind switch
                            {
                                SyncResultKind.Updated when snapshot.IstNeuerFall =>
                                    $"Neu erfasst ({maskeLabel}) — {id}",
                                SyncResultKind.Updated when fallWechsel =>
                                    $"Neuer Fall ({maskeLabel}) — {id}",
                                SyncResultKind.Updated => $"Aktualisiert ({maskeLabel}) — {id}",
                                SyncResultKind.Heartbeat when fallWechsel =>
                                    $"Neuer Fall ({maskeLabel}) — {id}",
                                _ => $"Live ({maskeLabel}) — {id}",
                            });
                        }
                        catch (Exception syncEx)
                        {
                            _offlineQueue.Enqueue(snapshot);
                            ErrorOccurred?.Invoke(syncEx);
                            SetStatus($"Queue offline — {SterbefallTracker.Schluessel(snapshot)}");
                        }
                    }
                    else
                    {
                        _offlineQueue.Enqueue(snapshot);
                        SetStatus($"Erfasst (offline) — {SterbefallTracker.Schluessel(snapshot)}");
                    }
                }
            }
            catch (Exception ex)
            {
                ErrorOccurred?.Invoke(ex);
                SetStatus($"Fehler: {ex.Message}");
            }

            try
            {
                await Task.Delay(sofortWeiter ? 0 : _pollIntervalMs, ct);
            }
            catch (TaskCanceledException)
            {
                break;
            }
        }
    }
}
