namespace Alamida.Monitoring.Profiles;

/// <summary>
/// Erkennung von Krematorien und Krankenhäusern an Überführungsorten (von/nach).
/// </summary>
public static class OrtSchluesselwoerter
{
    /// <summary>Enthält-Keywords für Kremation / Krematorium.</summary>
    public static readonly string[] Kremation =
    [
        "krematorium",
        "innermanzing",
        "feba",
        "kremation",
        "einäscherung",
        "einaescherung",
        "feuerbestattung",
        "einäscherungsanlage",
    ];

    /// <summary>Präfixe am Ortsnamen (Groß/Kleinschreibung egal).</summary>
    public static readonly string[] KrankenhausPraefixe =
    [
        "UK ",
        "UK-",
        "KH ",
        "KH-",
        "KH.",
    ];

    public static readonly string[] KrankenhausKeywords =
    [
        "krankenhaus",
        "spital",
        "klinik",
        "landesklinik",
    ];

    public static bool IstKrematorium(string? ort)
    {
        if (string.IsNullOrWhiteSpace(ort)) return false;
        var lower = ort.Trim().ToLowerInvariant();
        return Kremation.Any(kw => lower.Contains(kw, StringComparison.Ordinal));
    }

    public static bool IstKrankenhaus(string? ort)
    {
        if (string.IsNullOrWhiteSpace(ort)) return false;
        var t = ort.Trim();
        foreach (var p in KrankenhausPraefixe)
        {
            if (t.StartsWith(p, StringComparison.OrdinalIgnoreCase))
                return true;
        }

        var lower = t.ToLowerInvariant();
        return KrankenhausKeywords.Any(kw => lower.Contains(kw, StringComparison.Ordinal));
    }
}
