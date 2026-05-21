using FlaUI.Core.AutomationElements;

namespace Alamida.Monitoring.Watcher;

internal static class UiaValueReader
{
    public static string? Read(AutomationElement element)
    {
        try
        {
            if (element.Patterns.Value.IsSupported)
            {
                var v = element.Patterns.Value.Pattern.Value.Value;
                if (!string.IsNullOrWhiteSpace(v))
                    return v.Trim();
            }
        }
        catch { /* ignore */ }

        try
        {
            var text = element.AsTextBox()?.Text;
            if (!string.IsNullOrWhiteSpace(text))
                return text.Trim();
        }
        catch { /* ignore */ }

        try
        {
            var name = element.Name;
            if (!string.IsNullOrWhiteSpace(name))
                return name.Trim();
        }
        catch { /* ignore */ }

        return null;
    }

    public static T? SafeGet<T>(Func<T> getter)
    {
        try { return getter(); }
        catch { return default; }
    }
}
