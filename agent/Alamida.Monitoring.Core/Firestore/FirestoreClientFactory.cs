using System.Text.Json;
using Google.Apis.Auth.OAuth2;
using Google.Cloud.Firestore;

namespace Alamida.Monitoring.Core.Firestore;

public static class FirestoreClientFactory
{
    private static readonly string[] FirestoreScopes =
    [
        "https://www.googleapis.com/auth/datastore",
        "https://www.googleapis.com/auth/cloud-platform",
    ];

    public static string GetAppDataDir() =>
        Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData),
            "AlamidaMonitoring");

    public static string GetErrorLogPath() =>
        Path.Combine(GetAppDataDir(), "firestore-last-error.txt");

    public static FirestoreSyncService? TryCreate(string projectId, string workstationId) =>
        TryCreate(projectId, workstationId, null, out _);

    public static FirestoreSyncService? TryCreate(
        string projectId,
        string workstationId,
        out string? error) =>
        TryCreate(projectId, workstationId, null, out error);

    public static FirestoreSyncService? TryCreate(
        string projectId,
        string workstationId,
        string? serviceAccountPathHint,
        out string? error)
    {
        error = null;
        var appData = GetAppDataDir();
        var serviceAccountPath = ResolveServiceAccountPath(serviceAccountPathHint);

        if (!IsValidServiceAccount(serviceAccountPath))
        {
            error = BuildMissingServiceAccountMessage(serviceAccountPath);
            WriteError(error);
            return null;
        }

        try
        {
            var db = CreateDbFromServiceAccount(projectId, serviceAccountPath);
            return new FirestoreSyncService(db, workstationId);
        }
        catch (Exception ex)
        {
            error = $"Firebase-Verbindung fehlgeschlagen: {ex.Message}";
            WriteError($"{error}\nPfad: {serviceAccountPath}");
            return null;
        }
    }

    /// <summary>Schreibtest (Dienstkonto). Mehrere PCs duerfen dieselbe JSON nutzen — je PC eigener Pfad unter %AppData%.</summary>
    public static async Task<(bool Ok, string? Error)> VerifyWriteAccessAsync(
        string projectId,
        string serviceAccountPath,
        string workstationId,
        CancellationToken ct = default)
    {
        try
        {
            var db = CreateDbFromServiceAccount(projectId, serviceAccountPath);
            var docId = $"probe_{SanitizeDocId(workstationId)}";
            var healthRef = db.Collection("_agent_health").Document(docId);
            await healthRef.SetAsync(new Dictionary<string, object>
            {
                ["workstationId"] = workstationId,
                ["machine"] = Environment.MachineName,
                ["user"] = Environment.UserName,
                ["probeAt"] = Timestamp.FromDateTime(DateTime.UtcNow),
            }, cancellationToken: ct);
            return (true, null);
        }
        catch (Exception ex)
        {
            var msg =
                $"{ex.Message}\n\nPruefen: Dienstkonto-Rolle „Cloud Datastore User“ oder „Firebase Admin SDK Administrator Service Agent“ im Projekt {projectId}.";
            WriteError($"Schreibtest: {msg}\nPfad: {serviceAccountPath}");
            return (false, msg);
        }
    }

    public static void WriteError(string message)
    {
        try
        {
            var appData = GetAppDataDir();
            Directory.CreateDirectory(appData);
            File.WriteAllText(
                GetErrorLogPath(),
                $"[{DateTime.Now:O}] {message}{Environment.NewLine}{Environment.NewLine}");
        }
        catch { /* ignore */ }
    }

    public static string ResolveServiceAccountPath(string? hint)
    {
        var appData = GetAppDataDir();
        if (!string.IsNullOrWhiteSpace(hint))
        {
            var expanded = ExpandAppDataPath(hint.Trim());
            if (IsValidServiceAccount(expanded))
                return Path.GetFullPath(expanded);
        }

        return Path.Combine(appData, "serviceAccount.json");
    }

    private static string ExpandAppDataPath(string path)
    {
        var roaming = Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData);
        return path.Replace("%AppData%", roaming, StringComparison.OrdinalIgnoreCase);
    }

    private static string BuildMissingServiceAccountMessage(string checkedPath) =>
        "Firebase-Dienstkonto fehlt oder ist ungueltig.\n\n" +
        $"Erwartet: {Path.Combine(GetAppDataDir(), "serviceAccount.json")}\n" +
        (checkedPath != Path.Combine(GetAppDataDir(), "serviceAccount.json")
            ? $"Geprueft: {checkedPath}\n"
            : "") +
        "\nLoesung: install-wizard ausfuehren und Firebase-JSON waehlen (FIREBASE-SETUP.txt).\n" +
        "Hinweis: Jeder Windows-Benutzer/PC braucht die Datei in SEINEM Profil (%AppData%).\n" +
        "firebase-oauth.json reicht NICHT — nur serviceAccount.json vom Dienstkonto.";

    private static FirestoreDb CreateDbFromServiceAccount(string projectId, string serviceAccountPath)
    {
        var credential = GoogleCredential.FromFile(serviceAccountPath)
            .CreateScoped(FirestoreScopes);
        return new FirestoreDbBuilder
        {
            ProjectId = projectId,
            Credential = credential,
        }.Build();
    }

    private static bool IsValidServiceAccount(string path)
    {
        if (!File.Exists(path)) return false;
        try
        {
            using var doc = JsonDocument.Parse(File.ReadAllText(path));
            var root = doc.RootElement;
            return root.TryGetProperty("private_key", out _)
                   && root.TryGetProperty("client_email", out _)
                   && root.TryGetProperty("type", out var t)
                   && t.GetString() == "service_account";
        }
        catch
        {
            return false;
        }
    }

    private static string SanitizeDocId(string id)
    {
        var s = id.Trim();
        if (string.IsNullOrEmpty(s)) return "unknown";
        foreach (var c in Path.GetInvalidFileNameChars())
            s = s.Replace(c, '_');
        return s.Length > 80 ? s[..80] : s;
    }
}
