using Alamida.Monitoring.Profiles;
using FlaUI.Core.AutomationElements;
using FlaUI.Core.Definitions;
using FlaUI.UIA3;

namespace Alamida.Monitoring.Watcher;

public static class AlamidaWindowHelper
{
    public static AutomationElement? FindBestWindow(
        UIA3Automation automation,
        IReadOnlyList<string> titlePatterns)
    {
        var desktop = automation.GetDesktop();
        var windows = desktop.FindAllChildren(cf => cf.ByControlType(ControlType.Window));

        AutomationElement? best = null;
        var bestScore = -1;

        foreach (var window in windows)
        {
            var title = window.Name ?? "";
            if (!titlePatterns.Any(p => title.Contains(p, StringComparison.OrdinalIgnoreCase)))
                continue;

            var score = ScoreWindow(window);
            if (score > bestScore)
            {
                bestScore = score;
                best = window;
            }
        }

        return best;
    }

    public static int ScoreWindow(AutomationElement window)
    {
        var score = 0;
        try
        {
            var r = window.BoundingRectangle;
            score += (int)(r.Width * r.Height / 10_000);
        }
        catch { /* ignore */ }

        foreach (var el in window.FindAllDescendants())
        {
            var aid = UiaValueReader.SafeGet(() => el.AutomationId) ?? "";
            var name = UiaValueReader.SafeGet(() => el.Name) ?? "";

            if (aid.Contains("Termin_Überführung1_Text", StringComparison.OrdinalIgnoreCase))
                score += 1000;
            if (aid.Contains("Layout Object: 287303", StringComparison.OrdinalIgnoreCase))
                score += 500;

            if (name.Contains("Neuer Sterbefall", StringComparison.OrdinalIgnoreCase) ||
                name.Contains("Neuer Sterbefalls", StringComparison.OrdinalIgnoreCase))
                score += 1200;

            foreach (var marker in MaskDetector.NeuerSterbefallAutomationMarkers)
            {
                if (aid.Contains(marker, StringComparison.OrdinalIgnoreCase))
                    score += 800;
            }
        }

        return score;
    }
}
