using Alamida.Monitoring.Watcher;
using Xunit;

namespace Alamida.Monitoring.Tests;

public sealed class MaskDetectorHeaderTests
{
    [Theory]
    [InlineData("260095 | Gabriele Melichar (76)")]
    [InlineData("260087 | Max Mustermann")]
    public void LooksLikeSterbefallHeader_erkennt_live_header_muster(string text)
    {
        Assert.True(MaskDetector.LooksLikeSterbefallHeader(text));
    }

    [Theory]
    [InlineData("")]
    [InlineData("Daten des Verstorbenen")]
    [InlineData("Standesamt Sterbeort")]
    public void LooksLikeSterbefallHeader_lehnt_labels_ab(string text)
    {
        Assert.False(MaskDetector.LooksLikeSterbefallHeader(text));
    }
}
