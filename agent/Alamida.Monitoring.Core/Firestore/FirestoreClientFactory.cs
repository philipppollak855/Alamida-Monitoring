using System.Text.Json;
using Google.Apis.Auth.OAuth2;
using Google.Cloud.Firestore;

namespace Alamida.Monitoring.Core.Firestore;

public static class FirestoreClientFactory
{
    private const string ClientId =
        "563584335869-fgrhgmd47bqnekij5i8b5pr03ho849e6.apps.googleusercontent.com";

    public static FirestoreSyncService? TryCreate(string projectId, string workstationId)
    {
        var appData = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData),
            "AlamidaMonitoring");

        var serviceAccount = Path.Combine(appData, "serviceAccount.json");
        if (IsValidServiceAccount(serviceAccount))
        {
            return new FirestoreSyncService(projectId, serviceAccount, workstationId);
        }

        var oauthPath = Path.Combine(appData, "firebase-oauth.json");
        if (File.Exists(oauthPath))
        {
            var db = CreateDbFromOAuth(projectId, oauthPath);
            return db != null ? new FirestoreSyncService(db, workstationId) : null;
        }

        return null;
    }

    private static bool IsValidServiceAccount(string path)
    {
        if (!File.Exists(path)) return false;
        var text = File.ReadAllText(path);
        return text.Contains("private_key", StringComparison.Ordinal) &&
               text.Contains("client_email", StringComparison.Ordinal);
    }

    private static FirestoreDb? CreateDbFromOAuth(string projectId, string oauthPath)
    {
        try
        {
            using var doc = JsonDocument.Parse(File.ReadAllText(oauthPath));
            var refresh = doc.RootElement.GetProperty("refreshToken").GetString();
            if (string.IsNullOrEmpty(refresh)) return null;

            using var http = new HttpClient();
            var content = new FormUrlEncodedContent(new Dictionary<string, string>
            {
                ["client_id"] = ClientId,
                ["grant_type"] = "refresh_token",
                ["refresh_token"] = refresh,
            });
            var resp = http.PostAsync("https://oauth2.googleapis.com/token", content)
                .GetAwaiter().GetResult();
            resp.EnsureSuccessStatusCode();
            var body = resp.Content.ReadAsStringAsync().GetAwaiter().GetResult();
            using var tokenDoc = JsonDocument.Parse(body);
            var accessToken = tokenDoc.RootElement.GetProperty("access_token").GetString();
            if (string.IsNullOrEmpty(accessToken)) return null;

            var credential = GoogleCredential.FromAccessToken(accessToken);
            return new FirestoreDbBuilder
            {
                ProjectId = projectId,
                Credential = credential,
            }.Build();
        }
        catch
        {
            return null;
        }
    }
}
