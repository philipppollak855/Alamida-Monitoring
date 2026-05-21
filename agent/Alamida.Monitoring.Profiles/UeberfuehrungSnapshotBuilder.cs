using Alamida.Monitoring.Core.Models;



namespace Alamida.Monitoring.Profiles;



public static class UeberfuehrungSnapshotBuilder

{

    public static DetailSnapshot Build(

        string? sterbefallId,

        string? verstorbenerName,

        string? sterbeort,

        string? bestattungsart,

        string? beisetzungsort,

        string? krematoriumOrt,

        string? feuerbestattungOrt,

        string? kuehlraumRaw,

        string? kuehlplatzField,

        string? beisetzungsDatum,

        string? beisetzungsZeit,

        string? trauerfeierDatum,

        string? trauerfeierZeit,

        string? imAnschlussRaw,

        IReadOnlyList<(string? RouteText, string? Datum)> rohdaten)

    {

        var schritte = new List<UeberfuehrungSchritt>();

        for (var i = 0; i < rohdaten.Count; i++)

        {

            var (route, datum) = rohdaten[i];

            if (string.IsNullOrWhiteSpace(route))

                continue;



            var zeile = i + 1;

            var (von, nach, kr) = AlamidaFieldParser.ParseUeberfuehrungText(route);

            var typ = UeberfuehrungTypResolver.Classify(zeile, von, nach);

            schritte.Add(new UeberfuehrungSchritt

            {

                Zeile = zeile,

                SchrittTyp = typ,

                VonOrt = von,

                NachOrt = nach,

                TerminAm = string.IsNullOrWhiteSpace(datum) ? null : datum.Trim(),

                Kuehlraum = kr,

            });

        }



        var abholort = UeberfuehrungTypResolver.AbholortAusErsterZeile(
            schritte.FirstOrDefault(s => s.SchrittTyp == "abholung")?.VonOrt);
        var abholortIstKh = UeberfuehrungTypResolver.IstKrankenhausAbholort(abholort)
            || UeberfuehrungTypResolver.IstKrankenhausAbholort(sterbeort);

        var effektiverSterbeort = string.IsNullOrWhiteSpace(sterbeort) ? abholort : sterbeort;



        var heute = DateTime.Today;

        var (art, endziel, endzielTyp) = BestattungsartResolver.Resolve(

            bestattungsart, beisetzungsort, krematoriumOrt, feuerbestattungOrt);



        var verlauf = PositionsResolver.BuildVerlauf(effektiverSterbeort, schritte);

        var (aktuell, naechste) = PositionsResolver.ResolveAktuell(effektiverSterbeort, schritte, heute);

        var (kuehlraum, platz) = KuehlraumEffektivResolver.Resolve(aktuell, kuehlraumRaw, kuehlplatzField);

        var ausstehend = AusstehendeUeberfuehrungenResolver.Resolve(effektiverSterbeort, schritte, heute);

        var historie = SterbefallHistorieResolver.Resolve(
            beisetzungsDatum,
            beisetzungsZeit,
            trauerfeierDatum,
            trauerfeierZeit,
            imAnschlussRaw,
            DateTime.Now);



        return new DetailSnapshot

        {

            SterbefallId = sterbefallId,

            VerstorbenerName = verstorbenerName,

            Sterbeort = effektiverSterbeort,

            Abholort = abholort,
            AbholortIstKrankenhaus = abholortIstKh,

            Bestattungsart = bestattungsart ?? art.ToString(),

            Endziel = endziel,

            EndzielTyp = endzielTyp,

            Kuehlraum = kuehlraum,

            Kuehlplatz = platz,

            Verlauf = verlauf,

            Ausstehend = ausstehend,

            AktuellePosition = aktuell?.Ort,

            AktuellePositionTyp = aktuell?.Typ,

            AktuelleZeile = aktuell?.Nummer,

            AktuellerSchrittTyp = aktuell?.Typ,

            VonOrt = aktuell?.VonOrt ?? aktuell?.Ort,

            NachOrt = aktuell?.NachOrt,

            TerminAm = aktuell?.TerminAm,

            Schritte = schritte,

            NaechsterSchrittAm = naechste?.TerminAm,

            NaechsterSchrittVon = naechste?.VonOrt,

            NaechsterSchrittNach = naechste?.NachOrt,

            NaechsterSchrittTyp = naechste?.SchrittTyp,

            BeisetzungsDatum = beisetzungsDatum,

            BeisetzungsZeit = beisetzungsZeit,

            TrauerfeierDatum = trauerfeierDatum,

            TrauerfeierZeit = trauerfeierZeit,

            ImAnschluss = SterbefallHistorieResolver.IstImAnschluss(imAnschlussRaw),

            InHistory = historie.InHistory,

            SichtbarBis = historie.SichtbarBis,

            HistorieGrund = historie.Grund,

        };

    }



    public static bool TryParseDatum(string? text, out DateTime datum) =>

        AlamidaFieldParser.TryParseDatum(text, out datum);

}

