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
}
