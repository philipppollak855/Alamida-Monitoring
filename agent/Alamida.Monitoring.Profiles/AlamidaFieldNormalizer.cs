using System.Globalization;

namespace Alamida.Monitoring.Profiles;

public static class AlamidaFieldNormalizer
{
    /// <summary>Zeilenumbrüche und Mehrfach-Leerzeichen (z. B. SD_Sterbeort_komplett).</summary>
    public static string? Normalize(string? value)
    {
        if (string.IsNullOrWhiteSpace(value)) return null;
        return string.Join(' ', value.Split((char[]?)null, StringSplitOptions.RemoveEmptyEntries));
    }

    /// <summary>Kalender-/Datumsfelder einheitlich als dd.MM.yyyy (für Web-Parsing).</summary>
    public static string? NormalizeDatum(string? value)
    {
        if (string.IsNullOrWhiteSpace(value)) return null;
        if (!AlamidaFieldParser.TryParseDatum(value, out var d)) return Normalize(value);
        return d.ToString("dd.MM.yyyy", CultureInfo.InvariantCulture);
    }
}
