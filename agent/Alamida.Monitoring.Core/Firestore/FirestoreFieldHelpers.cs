using System.Linq;
using Google.Cloud.Firestore;

namespace Alamida.Monitoring.Core.Firestore;

internal static class FirestoreFieldHelpers
{
    public static string? SafeString(DocumentSnapshot snap, string field)
    {
        if (!snap.Exists || !snap.ContainsField(field)) return null;
        try
        {
            return snap.GetValue<string>(field);
        }
        catch
        {
            return snap.GetValue<object>(field)?.ToString();
        }
    }

    public static bool SafeBool(DocumentSnapshot snap, string field, bool fallback = false)
    {
        if (!snap.Exists || !snap.ContainsField(field)) return fallback;
        try
        {
            return snap.GetValue<bool>(field);
        }
        catch
        {
            var raw = snap.GetValue<object>(field);
            return raw switch
            {
                bool b => b,
                string s when bool.TryParse(s, out var parsed) => parsed,
                _ => fallback,
            };
        }
    }

    public static bool HasNonEmptyListField(DocumentSnapshot snap, string field)
    {
        if (!snap.Exists || !snap.ContainsField(field)) return false;
        try
        {
            var raw = snap.GetValue<object>(field);
            return raw switch
            {
                null => false,
                System.Collections.IList list => list.Count > 0,
                System.Collections.IEnumerable en when raw is not string => en.Cast<object>().Any(),
                _ => false,
            };
        }
        catch
        {
            return false;
        }
    }

    /// <summary>Firestore-Dokument-IDs: kein /, nicht leer, max. 1500 Bytes.</summary>
    public static string SanitizeDocumentId(string id)
    {
        var s = id.Trim();
        if (string.IsNullOrEmpty(s)) return "NEU-unbekannt";
        s = s.Replace('/', '_').Replace('\\', '_');
        if (s is "." or "..") s = "NEU-invalid";
        if (s.Length > 200) s = s[..200];
        return s;
    }
}
