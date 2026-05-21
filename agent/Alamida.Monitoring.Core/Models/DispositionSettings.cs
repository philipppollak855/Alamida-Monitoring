namespace Alamida.Monitoring.Core.Models;

public sealed class DispositionSettings
{
    public List<string> KremationKeywords { get; init; } = [];
    public List<string> KrankenhausPrefixe { get; init; } = [];
    public List<string> KrankenhausKeywords { get; init; } = [];
    public List<EigenerKuehlraumConfig> EigeneKuehlraeume { get; init; } = [];

    public static DispositionSettings Default => new()
    {
        KremationKeywords =
        [
            "krematorium", "innermanzing", "feba", "kremation", "einäscherung",
            "einaescherung", "feuerbestattung", "einäscherungsanlage",
        ],
        KrankenhausPrefixe = ["UK ", "UK-", "KH ", "KH-", "KH."],
        KrankenhausKeywords = ["krankenhaus", "spital", "klinik", "landesklinik"],
        EigeneKuehlraeume =
        [
            new EigenerKuehlraumConfig
            {
                Id = "grafenbach",
                Label = "Firmenkühlraum Grafenbach",
                AlamidaName = "Kühlr. Grafenbach",
                MatchKeywords = ["grafenbach", "kühlr. grafenbach", "kuehlr. grafenbach"],
                Plaetze = 9,
            },
        ],
    };
}

public sealed class EigenerKuehlraumConfig
{
    public string Id { get; init; } = "";
    public string Label { get; init; } = "";
    public string? AlamidaName { get; init; }
    public List<string> MatchKeywords { get; init; } = [];
    public int Plaetze { get; init; } = 9;
}
