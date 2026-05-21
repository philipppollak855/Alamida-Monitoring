using Alamida.Monitoring.Profiles;
using FlaUI.Core.AutomationElements;

namespace Alamida.Monitoring.Watcher;

public static class UiaFieldExtractor
{
    public static Dictionary<string, string?> ExtractFields(
        AutomationElement root,
        Dictionary<string, FieldLocator> locators)
    {
        var candidates = root.FindAllDescendants();
        var result = new Dictionary<string, string?>();

        foreach (var (key, locator) in locators)
        {
            var value = FindBestMatch(candidates, locator);
            if (!string.IsNullOrWhiteSpace(value))
                result[key] = value.Trim();
        }

        return result;
    }

    private static string? FindBestMatch(AutomationElement[] candidates, FieldLocator locator)
    {
        if (locator.AutomationIdContains.Count > 0)
        {
            string? fallback = null;
            foreach (var el in candidates)
            {
                var aid = UiaValueReader.SafeGet(() => el.AutomationId) ?? "";
                if (!locator.AutomationIdContains.Any(id =>
                        aid.Contains(id, StringComparison.OrdinalIgnoreCase)))
                    continue;

                var val = UiaValueReader.Read(el);
                if (string.IsNullOrWhiteSpace(val)) continue;

                if (UeberfuehrungSnapshotBuilder.TryParseDatum(val, out _))
                    return val.Trim();

                fallback ??= val.Trim();
            }

            if (!string.IsNullOrWhiteSpace(fallback))
                return fallback;
        }

        string? best = null;
        var bestScore = 0;

        foreach (var el in candidates)
        {
            var name = UiaValueReader.SafeGet(() => el.Name) ?? "";
            var ct = UiaValueReader.SafeGet(() => el.ControlType.ToString()) ?? "";
            if (locator.ControlTypes.Count > 0 &&
                !locator.ControlTypes.Any(t => ct.Contains(t, StringComparison.OrdinalIgnoreCase)))
                continue;

            var score = locator.NameContains.Count(term =>
                name.Contains(term, StringComparison.OrdinalIgnoreCase));
            if (score <= 0) continue;

            var val = UiaValueReader.Read(el);
            if (string.IsNullOrWhiteSpace(val)) continue;

            if (score > bestScore)
            {
                bestScore = score;
                best = val;
            }
        }

        return best;
    }
}
