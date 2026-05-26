using Alamida.Monitoring.Profiles;
using Xunit;

namespace Alamida.Monitoring.Tests;

public sealed class AlamidaFieldParserTests
{
    [Theory]
    [InlineData("260095 | Gabriele Melichar (76)", "260095", "Gabriele Melichar")]
    [InlineData("260087 | Max Mustermann", "260087", "Max Mustermann")]
    [InlineData("  42  |  Anna Beispiel  ", "42", "Anna Beispiel")]
    public void ParseSterbefallHeader_erkennt_id_und_name(string text, string expectedId, string expectedName)
    {
        var (id, name) = AlamidaFieldParser.ParseSterbefallHeader(text);

        Assert.Equal(expectedId, id);
        Assert.Equal(expectedName, name);
    }

    [Theory]
    [InlineData("")]
    [InlineData("   ")]
    [InlineData("Sterbefall ohne Pipe")]
    [InlineData("| nur Pipe")]
    public void ParseSterbefallHeader_liefert_keine_id_bei_ungueltigem_text(string text)
    {
        var (id, _) = AlamidaFieldParser.ParseSterbefallHeader(text);

        Assert.Null(id);
    }
}
