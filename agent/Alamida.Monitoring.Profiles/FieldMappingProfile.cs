using System.Text.Json;
using System.Text.Json.Serialization;

namespace Alamida.Monitoring.Profiles;

public sealed class FieldMappingProfile
{
    public string Version { get; set; } = "9.2.1";
    public List<string> WindowTitlePatterns { get; set; } = [];
    public DetailmaskeConfig Detailmaske { get; set; } = new();

    public static FieldMappingProfile Load(string path)
    {
        var json = File.ReadAllText(path);
        return JsonSerializer.Deserialize<FieldMappingProfile>(json,
            new JsonSerializerOptions { PropertyNameCaseInsensitive = true })
            ?? throw new InvalidOperationException($"Mapping konnte nicht geladen werden: {path}");
    }
}

public sealed class DetailmaskeConfig
{
    [JsonPropertyName("ueberfuehrung")]
    public UeberfuehrungMaskConfig Ueberfuehrung { get; set; } = new();
}

public sealed class UeberfuehrungMaskConfig
{
    public List<string> WindowTitleContains { get; set; } = [];
    public Dictionary<string, FieldLocator> Fields { get; set; } = new();
}

public sealed class FieldLocator
{
    public List<string> NameContains { get; set; } = [];
    public List<string> ControlTypes { get; set; } = [];
}
