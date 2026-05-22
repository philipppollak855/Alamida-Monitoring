using System.Text.Json;
using Google.Apis.Auth.OAuth2;
using Google.Cloud.Firestore;

namespace Alamida.Monitoring.Core.Firestore;

public static class FirestoreClientFactory
{
    // Öffentliche Firebase-CLI OAuth-Credentials (firebase-tools, nicht geheim)
    private const string ClientId =
        "563584335869-fgrhgmd47bqnekij5i8b5pr03ho849e6.apps.googleusercontent.com";
    private const string FirebaseCliClientSecret = "j9iVZfS8kkCEFUPaAeJV0sAi";

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
        var appData = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData),
            "AlamidaMonitoring");

        var serviceAccount = ResolveServiceAccountPath(appData, serviceAccountPathHint);
        if (IsValidServiceAccount(serviceAccount))
        {
            try
            {
                return new FirestoreSyncService(projectId, serviceAccount, workstationId);
            }
            catch (Exception ex)
            {
                error = $"Service Account: {ex.Message}";
                WriteError(appData, error);
                return null;
            }
        }

        var oauthPath = Path.Combine(appData, "firebase-oauth.json");
        if (!File.Exists(oauthPath))
        {
            error =
                "Firebase-Zugang fehlt. serviceAccount.json nach " +
                $"{appData} kopieren (Firebase Console → Dienstkonto) " +
                "oder Installation mit install-wizard.ps1 erneut ausführen.";
            WriteError(appData, error);
            return null;
        }

        var (db, oauthError) = CreateDbFromOAuth(projectId, oauthPath);
        if (db == null)
        {
            error = oauthError ?? "OAuth-Verbindung fehlgeschlagen.";
            WriteError(appData, error);
            return null;
        }

        return new FirestoreSyncService(db, workstationId);
    }

    private static void WriteError(string appData, string message)
    {
        try
        {
            Directory.CreateDirectory(appData);
            File.WriteAllText(Path.Combine(appData, "firestore-last-error.txt"),
                message + Environment.NewLine + DateTime.Now);
        }
        catch { /* ignore */ }
    }

    private static string ResolveServiceAccountPath(string appData, string? hint)
    {
        if (!string.IsNullOrWhiteSpace(hint))
        {
            var expanded = hint.Replace("%AppData%", appData, StringComparison.OrdinalIgnoreCase);
            if (IsValidServiceAccount(expanded))
                return expanded;
        }

        return Path.Combine(appData, "serviceAccount.json");
    }

    private static bool IsValidServiceAccount(string path)
    {
        if (!File.Exists(path)) return false;
        var text = File.ReadAllText(path);
        return text.Contains("private_key", StringComparison.Ordinal) &&
               text.Contains("client_email", StringComparison.Ordinal);
    }

    private static (FirestoreDb? Db, string? Error) CreateDbFromOAuth(string projectId, string oauthPath)
    {
        try
        {
            using var doc = JsonDocument.Parse(File.ReadAllText(oauthPath));
            var refresh = doc.RootElement.GetProperty("refreshToken").GetString();
            if (string.IsNullOrEmpty(refresh))
                return (null, "refreshToken in firebase-oauth.json ist leer.");

            using var http = new HttpClient { Timeout = TimeSpan.FromSeconds(30) };
            var clientSecret = doc.RootElement.TryGetProperty("clientSecret", out var secEl) &&
                               !string.IsNullOrWhiteSpace(secEl.GetString())
                ? secEl.GetString()!
                : FirebaseCliClientSecret;

            var content = new FormUrlEncodedContent(new Dictionary<string, string>
            {
                ["client_id"] = ClientId,
                ["client_secret"] = clientSecret,
                ["grant_type"] = "refresh_token",
                ["refresh_token"] = refresh,
            });
            var resp = http.PostAsync("https://oauth2.googleapis.com/token", content)
                .GetAwaiter().GetResult();
            var body = resp.Content.ReadAsStringAsync().GetAwaiter().GetResult();
            if (!resp.IsSuccessStatusCode)
                return (null, $"OAuth Token ({(int)resp.StatusCode}): {body}");

            using var tokenDoc = JsonDocument.Parse(body);
            var accessToken = tokenDoc.RootElement.GetProperty("access_token").GetString();
            if (string.IsNullOrEmpty(accessToken))
                return (null, "Kein access_token in OAuth-Antwort.");

            var credential = GoogleCredential.FromAccessToken(accessToken);
            var db = new FirestoreDbBuilder
            {
                ProjectId = projectId,
                Credential = credential,
            }.Build();
            return (db, null);
        }
        catch (Exception ex)
        {
            return (null, $"OAuth/Firestore: {ex.Message}");
        }
    }
}
