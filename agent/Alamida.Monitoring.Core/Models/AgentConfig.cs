namespace Alamida.Monitoring.Core.Models;

public sealed class AgentConfig
{
    public string FirebaseProjectId { get; set; } = "alamida---monitoring";
    public string ServiceAccountPath { get; set; } =
        Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData),
            "AlamidaMonitoring", "serviceAccount.json");
    public string WorkstationId { get; set; } = Environment.MachineName;
    public int PollIntervalMs { get; set; } = 2000;
    public string FieldMappingPath { get; set; } = "";
}
