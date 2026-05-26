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
            var value = FindBestMatch(candidates, locator, key);
            if (!string.IsNullOrWhiteSpace(value))
                result[key] = value.Trim();
        }

        return result;
    }

    private static bool IsTrauerfeier2AutomationId(string automationId) =>
        automationId.Contains("Trauerfeier2", StringComparison.OrdinalIgnoreCase)
        || automationId.Contains("Trauerfeier_2", StringComparison.OrdinalIgnoreCase)
        || automationId.Contains("Trauerfeier 2", StringComparison.OrdinalIgnoreCase);

    private static bool AutomationIdMatches(string automationId, FieldLocator locator, string fieldKey)
    {
        if (locator.AutomationIdExcludes.Count > 0
            && locator.AutomationIdExcludes.Any(ex =>
                automationId.Contains(ex, StringComparison.OrdinalIgnoreCase)))
        {
            return false;
        }

        if (!locator.AutomationIdContains.Any(id =>
                automationId.Contains(id, StringComparison.OrdinalIgnoreCase)))
        {
            return false;
        }

        return fieldKey switch
        {
            "trauerfeierdatum" or "trauerfeierzeit" => !IsTrauerfeier2AutomationId(automationId),
            "trauerfeier2datum" or "trauerfeier2zeit" => IsTrauerfeier2AutomationId(automationId),
            _ => true,
        };
    }

    private static int LongestMatchingPatternLength(string automationId, FieldLocator locator) =>
        locator.AutomationIdContains
            .Where(id => automationId.Contains(id, StringComparison.OrdinalIgnoreCase))
            .Select(id => id.Length)
            .DefaultIfEmpty(0)
            .Max();

    private static string? FindBestMatch(
        AutomationElement[] candidates,
        FieldLocator locator,
        string fieldKey)
    {
        if (locator.AutomationIdContains.Count > 0)
        {
            string? bestDate = null;
            var bestDateScore = 0;
            string? fallback = null;
            var bestFallbackScore = 0;

            foreach (var el in candidates)
            {
                var aid = UiaValueReader.SafeGet(() => el.AutomationId) ?? "";
                if (!AutomationIdMatches(aid, locator, fieldKey)) continue;

                var elName = UiaValueReader.SafeGet(() => el.Name) ?? "";
                var val = UiaValueReader.Read(el);
                if (!NameOrValueMatchesLocator(elName, val, locator)) continue;
                if (string.IsNullOrWhiteSpace(val)) continue;
                val = val.Trim();

                if (fieldKey == "sterbefallHeader" && !MaskDetector.LooksLikeSterbefallHeader(val))
                    continue;

                var score = LongestMatchingPatternLength(aid, locator);

                if (UeberfuehrungSnapshotBuilder.TryParseDatum(val, out _))
                {
                    if (score > bestDateScore)
                    {
                        bestDateScore = score;
                        bestDate = val;
                    }
                }
                else if (score > bestFallbackScore)
                {
                    bestFallbackScore = score;
                    fallback = val;
                }
            }

            if (!string.IsNullOrWhiteSpace(bestDate)) return bestDate;
            if (!string.IsNullOrWhiteSpace(fallback)) return fallback;
        }

        string? best = null;
        var bestScore = 0;

        foreach (var el in candidates)
        {
            var name = UiaValueReader.SafeGet(() => el.Name) ?? "";
            var ct = UiaValueReader.SafeGet(() => el.ControlType.ToString()) ?? "";
            if (locator.ControlTypes.Count > 0
                && !locator.ControlTypes.Any(t => ct.Contains(t, StringComparison.OrdinalIgnoreCase)))
            {
                continue;
            }

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

    private static bool NameOrValueMatchesLocator(string name, string? value, FieldLocator locator)
    {
        if (locator.NameContains.Count == 0) return true;

        return locator.NameContains.Any(term =>
            name.Contains(term, StringComparison.OrdinalIgnoreCase) ||
            (value?.Contains(term, StringComparison.OrdinalIgnoreCase) ?? false));
    }
}
