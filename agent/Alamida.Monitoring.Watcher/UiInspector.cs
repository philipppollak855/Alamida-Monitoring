using System.Text;
using FlaUI.Core;
using FlaUI.Core.AutomationElements;
using FlaUI.Core.Definitions;
using FlaUI.UIA3;

namespace Alamida.Monitoring.Watcher;

public static class UiInspector
{
    public static string DumpAllWindows(IEnumerable<string> titlePatterns)
    {
        var sb = new StringBuilder();
        using var automation = new UIA3Automation();

        foreach (var window in GetTopLevelWindows(automation))
        {
            var title = window.Name ?? "";
            if (!titlePatterns.Any(p => title.Contains(p, StringComparison.OrdinalIgnoreCase)))
                continue;

            sb.AppendLine($"=== WINDOW: {title} ===");
            DumpElement(window, sb, 0, maxDepth: 12);
            sb.AppendLine();
        }

        if (sb.Length == 0)
            sb.AppendLine("Kein Fenster mit passendem Titel gefunden. Alamida/FileMaker geöffnet?");

        return sb.ToString();
    }

    private static IEnumerable<AutomationElement> GetTopLevelWindows(UIA3Automation automation)
    {
        var desktop = automation.GetDesktop();
        return desktop.FindAllChildren(cf => cf.ByControlType(ControlType.Window));
    }

    private static void DumpElement(AutomationElement element, StringBuilder sb, int depth, int maxDepth)
    {
        if (depth > maxDepth) return;

        var indent = new string(' ', depth * 2);
        var name = element.Name ?? "";
        var aid = element.AutomationId ?? "";
        var ct = element.ControlType.ToString();
        var value = TryGetValue(element);

        sb.AppendLine($"{indent}[{ct}] Name=\"{name}\" AutomationId=\"{aid}\" Value=\"{value}\"");

        foreach (var child in element.FindAllChildren())
            DumpElement(child, sb, depth + 1, maxDepth);
    }

    private static string TryGetValue(AutomationElement element)
    {
        try
        {
            if (element.Patterns.Value.IsSupported)
                return element.Patterns.Value.Pattern.Value.Value ?? "";
        }
        catch { /* ignore */ }

        try
        {
            return element.AsTextBox()?.Text ?? "";
        }
        catch { /* ignore */ }

        return "";
    }
}
