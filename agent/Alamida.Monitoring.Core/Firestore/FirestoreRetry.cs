namespace Alamida.Monitoring.Core.Firestore;

public static class FirestoreRetry
{
    private static readonly string[] TransientMarkers =
    [
        "ResourceExhausted",
        "Unavailable",
        "DeadlineExceeded",
        "Aborted",
        "Internal",
        "TooManyRequests",
    ];

    public static bool IsTransient(Exception ex)
    {
        for (var cur = ex; cur != null; cur = cur.InnerException)
        {
            var msg = cur.Message;
            foreach (var marker in TransientMarkers)
            {
                if (msg.Contains(marker, StringComparison.OrdinalIgnoreCase))
                    return true;
            }
        }

        return false;
    }

    public static async Task<T> ExecuteAsync<T>(
        Func<Task<T>> action,
        CancellationToken ct,
        int maxAttempts = 5)
    {
        var delayMs = 400;
        Exception? last = null;

        for (var attempt = 0; attempt < maxAttempts; attempt++)
        {
            try
            {
                return await action();
            }
            catch (Exception ex) when (IsTransient(ex) && attempt < maxAttempts - 1)
            {
                last = ex;
                await Task.Delay(delayMs, ct);
                delayMs = Math.Min(delayMs * 2, 8000);
            }
        }

        if (last != null)
            throw last;

        return await action();
    }

    public static Task ExecuteAsync(Func<Task> action, CancellationToken ct, int maxAttempts = 5) =>
        ExecuteAsync(async () =>
        {
            await action();
            return true;
        }, ct, maxAttempts);
}
