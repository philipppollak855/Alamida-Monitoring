using Alamida.Monitoring.Core.Models;
using Google.Cloud.Firestore;

namespace Alamida.Monitoring.Core.Firestore;

public sealed class DispositionSettingsLoader
{
    private readonly FirestoreDb _db;
    private DispositionSettings _cached = DispositionSettings.Default;
    private DateTime _loadedAt = DateTime.MinValue;
    private long _lastSettingsVersion = -1;
    private static readonly TimeSpan CacheTtl = TimeSpan.FromSeconds(30);

    public DispositionSettingsLoader(FirestoreDb db) => _db = db;

    public DispositionSettings Current => _cached;

    public async Task RefreshAsync(CancellationToken ct = default)
    {
        try
        {
            var snap = await _db.Collection("settings").Document("disposition").GetSnapshotAsync(ct);
            var version = ReadSettingsVersion(snap);
            var cacheValid = DateTime.UtcNow - _loadedAt < CacheTtl && version == _lastSettingsVersion;
            if (cacheValid)
                return;

            _cached = snap.Exists ? Parse(snap) : DispositionSettings.Default;
            _lastSettingsVersion = version;
        }
        catch
        {
            _cached = DispositionSettings.Default;
        }

        _loadedAt = DateTime.UtcNow;
    }

    private static long ReadSettingsVersion(DocumentSnapshot snap)
    {
        if (!snap.Exists) return 0;
        if (snap.ContainsField("settingsVersion"))
        {
            var v = snap.GetValue<long>("settingsVersion");
            return v;
        }

        if (snap.ContainsField("updatedAt") && snap.GetValue<Timestamp>("updatedAt") is { } ts)
            return ts.ToDateTime().Ticks;

        return 0;
    }

    private static DispositionSettings Parse(DocumentSnapshot snap)
    {
        var d = DispositionSettings.Default;
        var krem = ReadStringList(snap, "kremationKeywords");
        var pref = ReadStringList(snap, "krankenhausPrefixe");
        var kh = ReadStringList(snap, "krankenhausKeywords");
        var kuehl = ReadKuehlraeume(snap);

        return new DispositionSettings
        {
            KremationKeywords = krem.Count > 0 ? krem : d.KremationKeywords,
            KrankenhausPrefixe = pref.Count > 0 ? pref : d.KrankenhausPrefixe,
            KrankenhausKeywords = kh.Count > 0 ? kh : d.KrankenhausKeywords,
            EigeneKuehlraeume = kuehl.Count > 0 ? kuehl : d.EigeneKuehlraeume,
        };
    }

    private static List<string> ReadStringList(DocumentSnapshot snap, string field)
    {
        if (!snap.ContainsField(field)) return [];
        return snap.GetValue<List<object>>(field)
            .Select(o => o?.ToString()?.Trim() ?? "")
            .Where(s => !string.IsNullOrEmpty(s))
            .ToList();
    }

    private static List<EigenerKuehlraumConfig> ReadKuehlraeume(DocumentSnapshot snap)
    {
        if (!snap.ContainsField("eigeneKuehlraeume")) return [];
        var list = new List<EigenerKuehlraumConfig>();
        foreach (var item in snap.GetValue<List<object>>("eigeneKuehlraeume"))
        {
            if (item is not Dictionary<string, object> dict) continue;
            var keywords = dict.TryGetValue("matchKeywords", out var mk) && mk is List<object> mkList
                ? mkList.Select(o => o?.ToString()?.Trim() ?? "").Where(s => s.Length > 0).ToList()
                : [];
            var plaetze = 9;
            if (dict.TryGetValue("plaetze", out var p))
            {
                plaetze = p switch
                {
                    long l => (int)l,
                    int i => i,
                    double dbl => (int)dbl,
                    _ => 9,
                };
            }

            list.Add(new EigenerKuehlraumConfig
            {
                Id = dict.GetValueOrDefault("id")?.ToString() ?? Guid.NewGuid().ToString("N")[..8],
                Label = dict.GetValueOrDefault("label")?.ToString() ?? "Kühlraum",
                AlamidaName = dict.GetValueOrDefault("alamidaName")?.ToString(),
                MatchKeywords = keywords,
                Plaetze = Math.Clamp(plaetze, 1, 99),
            });
        }

        return list;
    }
}
