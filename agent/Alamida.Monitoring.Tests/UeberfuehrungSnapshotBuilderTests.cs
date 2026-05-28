using Alamida.Monitoring.Profiles;
using Xunit;

namespace Alamida.Monitoring.Tests;

public sealed class UeberfuehrungSnapshotBuilderTests
{
    [Fact]
    public void Build_zeile1_uk_nach_kuehl_ohne_datum_setzt_abholort_und_ausstehend()
    {
        var snap = UeberfuehrungSnapshotBuilder.Build(
            sterbefallId: "260100",
            verstorbenerName: "Test",
            sterbeort: null,
            bestattungsart: null,
            beisetzungsort: null,
            krematoriumOrt: null,
            feuerbestattungOrt: null,
            kuehlraumRaw: null,
            kuehlplatzField: null,
            beisetzungsDatum: null,
            beisetzungsZeit: null,
            trauerfeierDatum: null,
            trauerfeierZeit: null,
            trauerfeierOrt: null,
            trauerfeier2Datum: null,
            trauerfeier2Zeit: null,
            trauerfeier2Ort: null,
            rosenkranzDatum: null,
            rosenkranzZeit: null,
            rosenkranzOrt: null,
            imAnschlussRaw: null,
            rohdaten: [("UK - Wiener Neustadt nach Kühl. Grafenbach", null)]);

        Assert.Equal("UK - Wiener Neustadt", snap.Abholort);
        Assert.True(snap.AbholortIstKrankenhaus);
        Assert.Contains(snap.Ausstehend, a =>
            a.Zeile == 1 && a.SchrittTyp == "abholung" && a.Status == "geplant");
        Assert.Equal("UK - Wiener Neustadt", snap.NaechsterSchrittVon);
        Assert.Equal("Kühl. Grafenbach", snap.NaechsterSchrittNach);
    }

    [Theory]
    [InlineData("UK - Wiener Neustadt nach Kühl. Grafenbach", "UK - Wiener Neustadt")]
    [InlineData("UK - Neunkirchen / Kühlr. Grafenbach", "UK - Neunkirchen")]
    public void AbholortAusErsterZeile_liefert_von_teil(string route, string expectedVon)
    {
        var abholort = UeberfuehrungTypResolver.AbholortAusErsterZeile(route);
        Assert.Equal(expectedVon, abholort);
    }

    [Fact]
    public void Build_bestattung_kunz_nach_kuehl_abholort_ist_nicht_krankenhaus()
    {
        var snap = UeberfuehrungSnapshotBuilder.Build(
            sterbefallId: "test",
            verstorbenerName: "Brauneder",
            sterbeort: null,
            bestattungsart: null,
            beisetzungsort: null,
            krematoriumOrt: null,
            feuerbestattungOrt: null,
            kuehlraumRaw: null,
            kuehlplatzField: null,
            beisetzungsDatum: null,
            beisetzungsZeit: null,
            trauerfeierDatum: null,
            trauerfeierZeit: null,
            trauerfeierOrt: null,
            trauerfeier2Datum: null,
            trauerfeier2Zeit: null,
            trauerfeier2Ort: null,
            rosenkranzDatum: null,
            rosenkranzZeit: null,
            rosenkranzOrt: null,
            imAnschlussRaw: null,
            rohdaten: [("Bestattung Kunz nach Kühlr. Grafenbach", null)]);

        Assert.Equal("Bestattung Kunz", snap.Abholort);
        Assert.False(snap.AbholortIstKrankenhaus);
        Assert.Equal("Bestattung Kunz", snap.NaechsterSchrittVon);
        Assert.Equal("Kühlr. Grafenbach", snap.NaechsterSchrittNach);
    }

    [Fact]
    public void Build_uk_wien_neustadt_ohne_ausstehend_array_felder_fuer_extern()
    {
        var snap = UeberfuehrungSnapshotBuilder.Build(
            sterbefallId: "260100",
            verstorbenerName: "Touahria",
            sterbeort: null,
            bestattungsart: null,
            beisetzungsort: null,
            krematoriumOrt: null,
            feuerbestattungOrt: null,
            kuehlraumRaw: null,
            kuehlplatzField: null,
            beisetzungsDatum: null,
            beisetzungsZeit: null,
            trauerfeierDatum: null,
            trauerfeierZeit: null,
            trauerfeierOrt: null,
            trauerfeier2Datum: null,
            trauerfeier2Zeit: null,
            trauerfeier2Ort: null,
            rosenkranzDatum: null,
            rosenkranzZeit: null,
            rosenkranzOrt: null,
            imAnschlussRaw: null,
            rohdaten: [("UK - Wiener Neustadt nach Kühl. Grafenbach", null)]);

        Assert.True(snap.AbholortIstKrankenhaus);
        Assert.NotEmpty(snap.Ausstehend);
        Assert.Contains(snap.Ausstehend, a =>
            a.SchrittTyp == "abholung" &&
            a.VonOrt != null &&
            a.VonOrt.Contains("Wiener Neustadt", StringComparison.OrdinalIgnoreCase));
    }
}
