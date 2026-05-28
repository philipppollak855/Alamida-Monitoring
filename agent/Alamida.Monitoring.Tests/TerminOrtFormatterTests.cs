using Alamida.Monitoring.Profiles;
using Xunit;

namespace Alamida.Monitoring.Tests;

public sealed class TerminOrtFormatterTests
{
    [Theory]
    [InlineData("Aufbahrungshalle", "Pottschach", "Aufbahrungshalle Pottschach")]
    [InlineData("Kirche", "St.Valentin", "Kirche St.Valentin")]
    [InlineData("Friedhof", "Ternitz", "Friedhof Ternitz")]
    [InlineData(null, "Friedhof Ternitz", "Friedhof Ternitz")]
    [InlineData("Kirche", "St.Valentin, Friedhof Ternitz", "Kirche St.Valentin, Friedhof Ternitz")]
    [InlineData("Aufbahrungshalle", null, "Aufbahrungshalle")]
    public void Combine_fuegt_ort_und_zusatz_zusammen(string? ort, string? zusatz, string expected) =>
        Assert.Equal(expected, TerminOrtFormatter.Combine(ort, zusatz));

    [Fact]
    public void Combine_vermeidet_doppelten_ort_prefix() =>
        Assert.Equal(
            "Kirche St.Valentin",
            TerminOrtFormatter.Combine("Kirche", "Kirche St.Valentin"));
}
