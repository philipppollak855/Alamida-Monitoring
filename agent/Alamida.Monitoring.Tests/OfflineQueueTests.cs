using Alamida.Monitoring.Core.Firestore;
using Alamida.Monitoring.Core.Models;
using Xunit;

namespace Alamida.Monitoring.Tests;

public class OfflineQueueTests
{
    [Fact]
    public void QueueKey_prefers_sterbefall_id()
    {
        var snap = new DetailSnapshot
        {
            SterbefallId = "260097",
            VerstorbenerName = "Test",
            ErfassungSchluessel = "other",
        };
        Assert.Equal("id:260097", OfflineQueue.QueueKey(snap));
    }

    [Fact]
    public void Compact_keeps_latest_per_sterbefall()
    {
        var a = new DetailSnapshot { SterbefallId = "1", VerstorbenerName = "Alt" };
        var b = new DetailSnapshot { SterbefallId = "1", VerstorbenerName = "Neu" };
        var c = new DetailSnapshot { SterbefallId = "2", VerstorbenerName = "Zwei" };

        var compacted = OfflineQueue.CompactSnapshots([a, b, c]);
        Assert.Equal(2, compacted.Count);
        Assert.Contains(compacted, s => s.SterbefallId == "1" && s.VerstorbenerName == "Neu");
    }
}
