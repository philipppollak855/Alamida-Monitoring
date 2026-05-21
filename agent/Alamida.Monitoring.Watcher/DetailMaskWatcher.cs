using Alamida.Monitoring.Core.Models;
using Alamida.Monitoring.Profiles;
using FlaUI.Core.AutomationElements;
using FlaUI.Core.Definitions;
using FlaUI.UIA3;

namespace Alamida.Monitoring.Watcher;

public sealed class DetailMaskWatcher
{
    private readonly FieldMappingProfile _profile;
    private string? _lastHash;

    public DetailMaskWatcher(FieldMappingProfile profile) => _profile = profile;

    public DetailSnapshot? TryCaptureSnapshot()
    {
        using var automation = new UIA3Automation();
        var window = FindAlamidaWindow(automation);
        if (window == null)
            return null;

        var mask = _profile.Detailmaske.Ueberfuehrung;
        var title = window.Name ?? "";
        if (mask.WindowTitleContains.Count > 0 &&
            !mask.WindowTitleContains.Any(t => title.Contains(t, StringComparison.OrdinalIgnoreCase)))
        {
            // Fenster offen, aber evtl. andere Maske — trotzdem Felder suchen
        }

        var fields = ExtractFields(window, mask.Fields);
        return new DetailSnapshot
        {
            SterbefallId = fields.GetValueOrDefault("sterbefallId"),
            VerstorbenerName = fields.GetValueOrDefault("verstorbenerName"),
            Kuehlraum = fields.GetValueOrDefault("kuehlraum"),
            VonOrt = fields.GetValueOrDefault("vonOrt"),
            NachOrt = fields.GetValueOrDefault("nachOrt"),
            AbholungAm = fields.GetValueOrDefault("abholungAm"),
        };
    }

    public bool HasChanged(DetailSnapshot snapshot)
    {
        var hash = snapshot.ContentHash();
        if (string.IsNullOrEmpty(hash) || hash == "|||||")
            return false;

        if (_lastHash == hash)
            return false;

        _lastHash = hash;
        return true;
    }

    private AutomationElement? FindAlamidaWindow(UIA3Automation automation)
    {
        var desktop = automation.GetDesktop();
        var windows = desktop.FindAllChildren(cf => cf.ByControlType(ControlType.Window));

        foreach (var window in windows)
        {
            var title = window.Name ?? "";
            if (_profile.WindowTitlePatterns.Any(p =>
                    title.Contains(p, StringComparison.OrdinalIgnoreCase)))
                return window;
        }

        return null;
    }

    private static Dictionary<string, string?> ExtractFields(
        AutomationElement root,
        Dictionary<string, FieldLocator> locators)
    {
        var result = new Dictionary<string, string?>();
        var candidates = root.FindAllDescendants(cf =>
            cf.ByControlType(ControlType.Edit)
                .Or(cf.ByControlType(ControlType.ComboBox))
                .Or(cf.ByControlType(ControlType.Text)));

        foreach (var (key, locator) in locators)
        {
            var value = FindBestMatch(candidates, locator);
            if (!string.IsNullOrWhiteSpace(value))
                result[key] = value.Trim();
        }

        return result;
    }

    private static string? FindBestMatch(
        AutomationElement[] candidates,
        FieldLocator locator)
    {
        string? best = null;
        var bestScore = 0;

        foreach (var el in candidates)
        {
            var name = el.Name ?? "";
            var ct = el.ControlType.ToString();
            if (locator.ControlTypes.Count > 0 &&
                !locator.ControlTypes.Any(t => ct.Contains(t, StringComparison.OrdinalIgnoreCase)))
                continue;

            var score = locator.NameContains.Count(term =>
                name.Contains(term, StringComparison.OrdinalIgnoreCase));

            if (score <= 0) continue;

            var val = ReadElementValue(el);
            if (string.IsNullOrWhiteSpace(val)) continue;

            if (score > bestScore)
            {
                bestScore = score;
                best = val;
            }
        }

        return best;
    }

    private static string? ReadElementValue(AutomationElement element)
    {
        try
        {
            if (element.Patterns.Value.IsSupported)
                return element.Patterns.Value.Pattern.Value.Value;
        }
        catch { /* ignore */ }

        try
        {
            return element.AsTextBox()?.Text;
        }
        catch { /* ignore */ }

        return element.Name;
    }
}
