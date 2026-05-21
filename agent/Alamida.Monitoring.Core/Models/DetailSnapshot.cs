namespace Alamida.Monitoring.Core.Models;

public sealed class DetailSnapshot
{
    public string? SterbefallId { get; init; }
    public string? VerstorbenerName { get; init; }
    public string? Kuehlraum { get; init; }
    public string? VonOrt { get; init; }
    public string? NachOrt { get; init; }
    public string? AbholungAm { get; init; }

    public string ContentHash()
    {
        return string.Join("|",
            SterbefallId ?? "",
            VerstorbenerName ?? "",
            Kuehlraum ?? "",
            VonOrt ?? "",
            NachOrt ?? "",
            AbholungAm ?? "");
    }

    public bool HasMinimumData =>
        !string.IsNullOrWhiteSpace(SterbefallId) ||
        !string.IsNullOrWhiteSpace(VerstorbenerName);
}
