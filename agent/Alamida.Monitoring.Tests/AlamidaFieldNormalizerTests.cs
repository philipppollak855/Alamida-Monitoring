using Alamida.Monitoring.Profiles;
using Xunit;

namespace Alamida.Monitoring.Tests;

public class AlamidaFieldNormalizerTests
{
    [Fact]
    public void Normalize_collapses_newlines_and_spaces()
    {
        Assert.Equal("UK - Wiener Neustadt", AlamidaFieldNormalizer.Normalize("UK - Wiener\r\nNeustadt"));
        Assert.Equal("Wiener Neustadt", AlamidaFieldNormalizer.Normalize("Wiener   Neustadt"));
    }

    [Theory]
    [InlineData("14:00", "14:00")]
    [InlineData("9.30", "09:30")]
    public void NormalizeZeit_formatiert_uhrzeit(string input, string expected)
    {
        Assert.Equal(expected, AlamidaFieldNormalizer.NormalizeZeit(input));
    }
}
