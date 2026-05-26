namespace Alamida.Monitoring.Profiles;

public static class AlamidaFieldNormalizer
{
    /// <summary>Zeilenumbrüche und Mehrfach-Leerzeichen (z. B. SD_Sterbeort_komplett).</summary>
    public static string? Normalize(string? value)
    {
        if (string.IsNullOrWhiteSpace(value)) return null;
        return string.Join(' ', value.Split((char[]?)null, StringSplitOptions.RemoveEmptyEntries));
    }
}
