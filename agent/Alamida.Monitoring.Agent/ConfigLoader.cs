using System.Text.Json;
using Alamida.Monitoring.Core.Models;
using Microsoft.Extensions.Configuration;

namespace Alamida.Monitoring.Agent;

public static class ConfigLoader
{
    public static AgentConfig Load()
    {
        var basePath = AppContext.BaseDirectory;
        var config = new ConfigurationBuilder()
            .SetBasePath(basePath)
            .AddJsonFile("appsettings.json", optional: true)
            .AddEnvironmentVariables(prefix: "ALAMIDA_")
            .Build();

        var appData = Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData);
        var candidates = new[]
        {
            Path.Combine(basePath, "field-mapping-9.2.1.json"),
            Path.GetFullPath(Path.Combine(basePath, "..", "..", "..", "..", "..", "docs", "field-mapping-9.2.1.json")),
            Path.GetFullPath(Path.Combine(basePath, "..", "..", "..", "..", "docs", "field-mapping-9.2.1.json")),
            Path.Combine(appData, "AlamidaMonitoring", "field-mapping-9.2.1.json"),
        };
        var defaultMapping = candidates.FirstOrDefault(File.Exists)
            ?? candidates[0];

        var serviceAccount = config["ServiceAccountPath"]?
            .Replace("%AppData%", appData, StringComparison.OrdinalIgnoreCase)
            ?? Path.Combine(appData, "AlamidaMonitoring", "serviceAccount.json");

        return new AgentConfig
        {
            FirebaseProjectId = config["FirebaseProjectId"] ?? "alamida---monitoring",
            ServiceAccountPath = serviceAccount,
            WorkstationId = string.IsNullOrWhiteSpace(config["WorkstationId"])
                ? Environment.MachineName
                : config["WorkstationId"]!,
            PollIntervalMs = int.TryParse(config["PollIntervalMs"], out var ms) ? ms : 2000,
            FieldMappingPath = string.IsNullOrWhiteSpace(config["FieldMappingPath"])
                ? defaultMapping
                : config["FieldMappingPath"]!,
        };
    }

    public static void SaveSampleConfig(string path)
    {
        var sample = new AgentConfig();
        Directory.CreateDirectory(Path.GetDirectoryName(path)!);
        File.WriteAllText(path, JsonSerializer.Serialize(sample, new JsonSerializerOptions { WriteIndented = true }));
    }
}
