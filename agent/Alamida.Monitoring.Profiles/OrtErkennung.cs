using System.Text.RegularExpressions;
using Alamida.Monitoring.Core.Models;

namespace Alamida.Monitoring.Profiles;

/// <summary>Gemeinsame Ort-Erkennung (Keywords, Präfixe, Wortgrenzen) — analog zur Web-App.</summary>
public static class OrtErkennung
{
    private static DispositionSettings _cfg = DispositionSettings.Default;

    public static void Apply(DispositionSettings settings) =>
        _cfg = Normalize(settings ?? DispositionSettings.Default);

    public static bool IstKrematorium(string? ort)
    {
        if (string.IsNullOrWhiteSpace(ort)) return false;
        return _cfg.KremationKeywords.Any(kw => KeywordEntspricht(ort, kw));
    }

    public static bool IstKrankenhaus(string? ort)
    {
        if (string.IsNullOrWhiteSpace(ort)) return false;
        var t = ort.Trim();
        if (_cfg.KrankenhausPrefixe.Any(p => !string.IsNullOrWhiteSpace(p) &&
            t.StartsWith(p.Trim(), StringComparison.OrdinalIgnoreCase)))
            return true;
        return _cfg.KrankenhausKeywords.Any(kw => KeywordEntspricht(ort, kw));
    }

    public static EigenerKuehlraumConfig? MatchEigenerKuehlraum(string? ort)
    {
        if (string.IsNullOrWhiteSpace(ort)) return null;
        var lower = ort.Trim().ToLowerInvariant();
        foreach (var kr in _cfg.EigeneKuehlraeume)
        {
            if (!string.IsNullOrWhiteSpace(kr.AlamidaName))
            {
                var name = kr.AlamidaName.Trim().ToLowerInvariant();
                if (lower.Contains(name)) return kr;
            }
            foreach (var kw in kr.MatchKeywords)
            {
                if (KeywordEntspricht(ort, kw)) return kr;
            }
        }

        if (Regex.IsMatch(ort, @"kühlr\.?|kuehlr\.?", RegexOptions.IgnoreCase) &&
            _cfg.EigeneKuehlraeume.Count > 0)
            return _cfg.EigeneKuehlraeume[0];

        return null;
    }

    public static bool KeywordEntspricht(string text, string keyword)
    {
        var k = keyword.Trim().ToLowerInvariant();
        if (k.Length < 2) return false;
        var t = text.ToLowerInvariant();

        if (k.Length >= 4 || k.Contains(' ') || k.Contains('-'))
            return t.Contains(k);

        var pattern = $@"(?:^|[\s,./(]|['""]){Regex.Escape(k)}(?:$|[\s,./)]|['""]|-)";
        return Regex.IsMatch(t, pattern, RegexOptions.IgnoreCase) || t.Contains(k);
    }

    private static DispositionSettings Normalize(DispositionSettings s) => new()
    {
        KremationKeywords = Dedupe(s.KremationKeywords),
        KrankenhausPrefixe = Dedupe(s.KrankenhausPrefixe),
        KrankenhausKeywords = Dedupe(s.KrankenhausKeywords),
        EigeneKuehlraeume = s.EigeneKuehlraeume.Select(kr => new EigenerKuehlraumConfig
        {
            Id = kr.Id,
            Label = kr.Label?.Trim() ?? "Kühlraum",
            AlamidaName = string.IsNullOrWhiteSpace(kr.AlamidaName) ? null : kr.AlamidaName.Trim(),
            MatchKeywords = Dedupe(kr.MatchKeywords),
            Plaetze = Math.Clamp(kr.Plaetze, 1, 99),
        }).ToList(),
    };

    private static List<string> Dedupe(IEnumerable<string> items)
    {
        var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        var list = new List<string>();
        foreach (var raw in items)
        {
            var t = raw?.Trim() ?? "";
            if (t.Length == 0 || !seen.Add(t)) continue;
            list.Add(t);
        }
        return list;
    }
}
