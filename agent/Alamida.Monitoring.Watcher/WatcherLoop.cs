using Alamida.Monitoring.Core.Firestore;
using Alamida.Monitoring.Core.Models;
using Alamida.Monitoring.Profiles;

namespace Alamida.Monitoring.Watcher;

public sealed class WatcherLoop
{
    private readonly AlamidaMaskWatcher _watcher;
    private readonly FirestoreSyncService? _firestore;
    private readonly DispositionSettingsLoader? _settingsLoader;
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
        DispositionSettingsLoader? settingsLoader,
        int pollIntervalMs)
    {
        _watcher = new AlamidaMaskWatcher(profile);
        _firestore = firestore;
        _settingsLoader = settingsLoader;
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
        if (!_watcher.LetztesAlamidaFensterGefunden)
        {
            SetStatus("Sync — Alamida-Fenster nicht gefunden");
            return false;
        }

        if (snapshot == null || !snapshot.HasMinimumData)
        {
            SetStatus(FormatCaptureStatus("Sync —", includeSyncHint: true));
            return false;
        }

        try
        {
            if (_settingsLoader != null)
            {
                await _settingsLoader.RefreshAsync(ct);
                OrtErkennung.Apply(_settingsLoader.Current);
            }
            var flush = await _offlineQueue.FlushAsync(_firestore, ct);
            if (flush.Failed > 0 && flush.LastError != null)
                LogSyncError(flush.LastError, "Flush vor manuellem Sync");
            _tracker.Register(snapshot);

            var result = await _firestore.SyncSnapshotAsync(snapshot, sterbefallWechsel: false, ct);
            var id = result.SterbefallId ?? SterbefallTracker.Schluessel(snapshot) ?? "?";
            var maske = snapshot.QuelleMaske == "neuer_sterbefall" ? "Neuer Sterbefall" : "Detail";
            SetStatus("Manuell: " + result.FormatTrayStatus(id, maske));
            return true;
        }
        catch (Exception ex)
        {
            _offlineQueue.Enqueue(snapshot);
            LogSyncError(ex, "Manueller Sync");
            ErrorOccurred?.Invoke(ex);
            SetStatus(FormatSyncErrorStatus(ex));
            return false;
        }
    }

    private static void LogSyncError(Exception ex, string context)
    {
        FirestoreClientFactory.WriteError(
            $"{context}: {ex.Message}\n{ex.GetType().Name}\n{ex.StackTrace}");
    }

    private static string FormatSyncErrorStatus(Exception ex)
    {
        var msg = ex.Message.Trim();
        if (msg.Length > 72) msg = msg[..72] + "…";
        return $"Sync fehlgeschlagen — {msg}";
    }

    private string FormatCaptureStatus(string prefix = "", bool includeSyncHint = false)
    {
        if (!_watcher.LetztesAlamidaFensterGefunden)
            return string.IsNullOrEmpty(prefix)
                ? "Alamida-Fenster nicht gefunden"
                : $"{prefix} Alamida-Fenster nicht gefunden";

        var maske = _watcher.LetzteErkannteMaske;
        if (maske == MaskKind.Unbekannt)
        {
            var msg = string.IsNullOrEmpty(prefix)
                ? "Alamida/Maske nicht erkannt"
                : $"{prefix} Alamida/Maske nicht erkannt";
            return includeSyncHint ? $"{msg} — Tab Termine oder Sterbefall öffnen" : msg;
        }

        return string.IsNullOrEmpty(prefix)
            ? "Sterbefall erkannt — Felder noch leer (Tab Termine?)"
            : $"{prefix} Sterbefall erkannt — Felder noch leer (Tab Termine?)";
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
                    SetStatus(FormatCaptureStatus());
                }
                else
                {
                    var (fallWechsel, _) = _tracker.Register(snapshot);
                    if (fallWechsel)
                        sofortWeiter = true;

                    if (_firestore != null)
                    {
                        try
                        {
                            if (_settingsLoader != null)
                            {
                                await _settingsLoader.RefreshAsync(ct);
                                OrtErkennung.Apply(_settingsLoader.Current);
                            }
                            var flush = await _offlineQueue.FlushAsync(_firestore, ct);
                            if (flush.Failed > 0 && flush.LastError != null)
                                LogSyncError(flush.LastError, "Queue-Flush");

                            var result = await _firestore.SyncSnapshotAsync(snapshot, fallWechsel, ct);
                            var id = result.SterbefallId
                                ?? SterbefallTracker.Schluessel(snapshot)
                                ?? "?";
                            var maskeLabel = snapshot.QuelleMaske == "neuer_sterbefall"
                                ? "Neuer Sterbefall"
                                : "Detail";

                            SetStatus(result.FormatTrayStatus(
                                id,
                                maskeLabel,
                                fallWechsel,
                                snapshot.IstNeuerFall));
                        }
                        catch (Exception syncEx)
                        {
                            _offlineQueue.Enqueue(snapshot);
                            LogSyncError(syncEx, $"Sync {SterbefallTracker.Schluessel(snapshot)}");
                            ErrorOccurred?.Invoke(syncEx);
                            var pending = _offlineQueue.PendingCount;
                            SetStatus(
                                pending > 1
                                    ? $"{FormatSyncErrorStatus(syncEx)} ({pending} in Queue)"
                                    : FormatSyncErrorStatus(syncEx));
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
