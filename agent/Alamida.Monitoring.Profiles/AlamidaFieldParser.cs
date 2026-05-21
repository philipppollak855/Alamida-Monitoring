using System.Globalization;
using System.Text.RegularExpressions;

namespace Alamida.Monitoring.Profiles;

public static class AlamidaFieldParser
{
    private static readonly Regex SterbefallHeaderRegex =
        new(@"^(\d+)\s*\|\s*(.+?)(?:\s*\(|$)", RegexOptions.Compiled);

    public static (string? Id, string? Name) ParseSterbefallHeader(string? text)
    {
        if (string.IsNullOrWhiteSpace(text)) return (null, null);
        var m = SterbefallHeaderRegex.Match(text.Trim());
        if (!m.Success) return (null, text.Trim());
        return (m.Groups[1].Value.Trim(), m.Groups[2].Value.Trim());
    }

    /// <summary>
    /// z.B. "UK Neunkirchen / Kühlr. Grafenbach" oder "Kühlr. Grafenbach / St. Johann"
    /// </summary>
    public static (string? Von, string? Nach, string? Kuehlraum) ParseUeberfuehrungText(string? text)
    {
        if (string.IsNullOrWhiteSpace(text)) return (null, null, null);

        var normalized = text.Replace(" nach ", "/", StringComparison.OrdinalIgnoreCase);
        var parts = normalized.Split('/', StringSplitOptions.TrimEntries | StringSplitOptions.RemoveEmptyEntries);
        if (parts.Length < 2)
            return (text.Trim(), null, ExtractKuehlraum(text));

        var von = parts[0].Trim();
        var nach = parts[1].Trim();
        // Kühlraum = Ziel (nach), wie in Alamida „von / nach“
        var kr = ExtractKuehlraum(nach);
        return (von, nach, kr);
    }

    /// <summary>
    /// Liefert den Ort unverändert wie in Alamida, z. B. „Kühlr. Grafenbach“.
    /// </summary>
    private static string? ExtractKuehlraum(string? part)
    {
        if (string.IsNullOrWhiteSpace(part)) return null;
        if (!part.Contains("Kühlr", StringComparison.OrdinalIgnoreCase) &&
            !part.Contains("Kuehlr", StringComparison.OrdinalIgnoreCase))
            return null;

        return part.Trim();
    }

    public static bool TryParseDatum(string? text, out DateTime datum)
    {
        datum = default;
        if (string.IsNullOrWhiteSpace(text)) return false;

        var s = text.Trim();
        if (DateTime.TryParseExact(s, "dd.MM.yyyy", CultureInfo.InvariantCulture,
                DateTimeStyles.None, out datum))
            return true;

        if (DateTime.TryParse(s, CultureInfo.GetCultureInfo("de-AT"), DateTimeStyles.None, out datum))
            return true;

        return false;
    }
}
