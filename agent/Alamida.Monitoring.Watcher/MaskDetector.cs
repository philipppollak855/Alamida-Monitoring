using FlaUI.Core.AutomationElements;

namespace Alamida.Monitoring.Watcher;

public static class MaskDetector
{
    public static readonly string[] NeuerSterbefallNameMarkers =
    [
        "Neuer Sterbefall",
        "Neuer Sterbefalls",
        "Sterbefall anlegen",
        "Neuen Sterbefall",
    ];

    public static readonly string[] NeuerSterbefallAutomationMarkers =
    [
        "Neuer_Sterbefall",
        "Sterbefall_Neu",
        "Neu_Sterbefall",
        "NeuerSterbefall",
        "Sterbefall anlegen",
    ];

    public static MaskKind Detect(AutomationElement window)
    {
        var scoreDetail = 0;
        var scoreNeu = 0;
        var hatUeberfuehrung1 = false;

        foreach (var el in window.FindAllDescendants())
        {
            var aid = UiaValueReader.SafeGet(() => el.AutomationId) ?? "";
            var name = UiaValueReader.SafeGet(() => el.Name) ?? "";

            if (aid.Contains("Termin_Überführung1_Text", StringComparison.OrdinalIgnoreCase))
            {
                scoreDetail += 1000;
                hatUeberfuehrung1 = true;
            }

            if (aid.Contains("Layout Object: 287303", StringComparison.OrdinalIgnoreCase))
                scoreDetail += 400;

            foreach (var marker in NeuerSterbefallNameMarkers)
            {
                if (name.Contains(marker, StringComparison.OrdinalIgnoreCase))
                    scoreNeu += 1500;
            }

            foreach (var marker in NeuerSterbefallAutomationMarkers)
            {
                if (aid.Contains(marker, StringComparison.OrdinalIgnoreCase))
                    scoreNeu += 900;
            }

            if (!hatUeberfuehrung1 &&
                (aid.Contains("Verstorben_Vorname", StringComparison.OrdinalIgnoreCase) ||
                 aid.Contains("Verstorben_Nachname", StringComparison.OrdinalIgnoreCase) ||
                 aid.Contains("Verstorben_Zuname", StringComparison.OrdinalIgnoreCase)))
                scoreNeu += 120;
        }

        if (scoreNeu > scoreDetail && scoreNeu >= 400)
            return MaskKind.NeuerSterbefall;

        if (scoreDetail >= 400)
            return MaskKind.DetailUeberfuehrung;

        if (scoreNeu >= 200)
            return MaskKind.NeuerSterbefall;

        return MaskKind.Unbekannt;
    }
}
