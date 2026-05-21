using Alamida.Monitoring.Core.Models;
using Alamida.Monitoring.Profiles;
using FlaUI.UIA3;

namespace Alamida.Monitoring.Watcher;

/// <summary>
/// Liest Detailmaske (Termine/Überführung) und Maske „Neuer Sterbefall“.
/// </summary>
public sealed class AlamidaMaskWatcher
{
    private readonly FieldMappingProfile _profile;
    private MaskKind _letzteMaske = MaskKind.Unbekannt;

    public AlamidaMaskWatcher(FieldMappingProfile profile) => _profile = profile;

    public MaskKind LetzteErkannteMaske => _letzteMaske;

    public DetailSnapshot? TryCaptureSnapshot() => TryCaptureSnapshot(out _);

    public DetailSnapshot? TryCaptureSnapshot(out string? debugLog)
    {
        debugLog = null;
        using var automation = new UIA3Automation();
        var window = AlamidaWindowHelper.FindBestWindow(automation, _profile.WindowTitlePatterns);
        if (window == null)
        {
            _letzteMaske = MaskKind.Unbekannt;
            return null;
        }

        var maske = MaskDetector.Detect(window);
        _letzteMaske = maske;

        if (maske == MaskKind.NeuerSterbefall && _profile.NeuerSterbefall.Fields.Count > 0)
        {
            var fields = UiaFieldExtractor.ExtractFields(window, _profile.NeuerSterbefall.Fields);
            debugLog = FormatDebug(maske, fields);
            var maxZeilen = _profile.Detailmaske.Ueberfuehrung.MaxEtappen > 0
                ? _profile.Detailmaske.Ueberfuehrung.MaxEtappen
                : AlamidaEtappenFields.DefaultMaxEtappen;
            return NeuerSterbefallSnapshotBuilder.Build(fields, maxZeilen);
        }

        if (maske == MaskKind.DetailUeberfuehrung ||
            _profile.Detailmaske.Ueberfuehrung.Fields.Count > 0)
        {
            var detailMask = _profile.Detailmaske.Ueberfuehrung;
            var fields = UiaFieldExtractor.ExtractFields(window, detailMask.Fields);
            debugLog = FormatDebug(MaskKind.DetailUeberfuehrung, fields);

            var header = fields.GetValueOrDefault("sterbefallHeader");
            var (id, name) = AlamidaFieldParser.ParseSterbefallHeader(header);
            var maxZeilen = detailMask.MaxEtappen > 0
                ? detailMask.MaxEtappen
                : AlamidaEtappenFields.DefaultMaxEtappen;
            var rohdaten = AlamidaEtappenFields.CollectRohdaten(fields, maxZeilen);

            var snap = UeberfuehrungSnapshotBuilder.Build(
                fields.GetValueOrDefault("sterbefallId") ?? id,
                fields.GetValueOrDefault("verstorbenerName") ?? name,
                fields.GetValueOrDefault("sterbeort"),
                fields.GetValueOrDefault("bestattungsart"),
                fields.GetValueOrDefault("beisetzungsort"),
                fields.GetValueOrDefault("krematoriumOrt"),
                fields.GetValueOrDefault("feuerbestattungOrt"),
                fields.GetValueOrDefault("kuehlraum"),
                fields.GetValueOrDefault("kuehlplatz"),
                rohdaten);

            return snap with
            {
                QuelleMaske = "detail_ueberfuehrung",
                ErfassungsPhase = "detail",
                IstNeuerFall = false,
                ErfassungSchluessel = snap.SterbefallId ?? snap.VerstorbenerName,
            };
        }

        return null;
    }

    private static string FormatDebug(MaskKind maske, Dictionary<string, string?> fields) =>
        $"Maske={maske}" + Environment.NewLine +
        string.Join(Environment.NewLine, fields.Select(kv => $"{kv.Key}={(kv.Value ?? "(leer)")}"));
}
