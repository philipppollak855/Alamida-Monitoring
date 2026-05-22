using System.Diagnostics;
using Alamida.Monitoring.Core.Models;

namespace Alamida.Monitoring.Agent;

/// <summary>
/// Prüft per Git, ob origin/{Branch} neuer ist, und startet scripts/update-agent.ps1 zum Pull/Build/Neustart.
/// </summary>
public sealed class AgentUpdateChecker
{
    private readonly AutoUpdateConfig _config;
    private readonly string _baseDirectory;

    public AgentUpdateChecker(AutoUpdateConfig config, string baseDirectory)
    {
        _config = config;
        _baseDirectory = baseDirectory;
    }

    public string? ResolvedRepoRoot { get; private set; }

    public string? LocalCommit { get; private set; }

    public string? RemoteCommit { get; private set; }

    /// <returns>true wenn ein Updater-Prozess gestartet wurde (Aufrufer soll beenden).</returns>
    public bool TryApplyUpdateIfAvailable(out string? message)
    {
        message = null;
        if (!_config.Enabled || !_config.CheckOnStartup)
            return false;

        ResolvedRepoRoot = ResolveRepoRoot();
        if (ResolvedRepoRoot == null)
            return false;

        if (!IsGitAvailable())
        {
            message = "Git nicht gefunden — Auto-Update übersprungen.";
            return false;
        }

        try
        {
            RunGit(ResolvedRepoRoot, "fetch", "origin", _config.Branch, "--quiet");
            LocalCommit = RunGit(ResolvedRepoRoot, "rev-parse", "HEAD");
            RemoteCommit = RunGit(ResolvedRepoRoot, "rev-parse", $"origin/{_config.Branch}");

            if (LocalCommit == RemoteCommit)
                return false;

            if (!StartUpdateScript(apply: true))
            {
                message = "Update-Skript konnte nicht gestartet werden.";
                return false;
            }

            message = $"Update wird installiert ({ShortHash(LocalCommit)} → {ShortHash(RemoteCommit)})…";
            return true;
        }
        catch (Exception ex)
        {
            message = $"Auto-Update übersprungen: {ex.Message}";
            return false;
        }
    }

    public bool IsUpdateAvailable()
    {
        ResolvedRepoRoot = ResolveRepoRoot();
        if (ResolvedRepoRoot == null || !IsGitAvailable())
            return false;

        try
        {
            RunGit(ResolvedRepoRoot, "fetch", "origin", _config.Branch, "--quiet");
            LocalCommit = RunGit(ResolvedRepoRoot, "rev-parse", "HEAD");
            RemoteCommit = RunGit(ResolvedRepoRoot, "rev-parse", $"origin/{_config.Branch}");
            return LocalCommit != RemoteCommit;
        }
        catch
        {
            return false;
        }
    }

    public bool StartUpdateScript(bool apply)
    {
        var repo = ResolveRepoRoot() ?? ResolvedRepoRoot;
        if (repo == null)
            return false;

        var script = Path.Combine(repo, "scripts", "update-agent.ps1");
        if (!File.Exists(script))
            return false;

        var args = $"-NoProfile -ExecutionPolicy Bypass -File \"{script}\" -RepoRoot \"{repo}\" -Branch \"{_config.Branch}\"";
        if (apply)
            args += " -Apply";

        Process.Start(new ProcessStartInfo
        {
            FileName = "powershell.exe",
            Arguments = args,
            UseShellExecute = true,
            WorkingDirectory = repo,
        });
        return true;
    }

    public string? ResolveRepoRoot()
    {
        if (!string.IsNullOrWhiteSpace(_config.RepoRoot))
        {
            var configured = Path.GetFullPath(_config.RepoRoot);
            return Directory.Exists(Path.Combine(configured, ".git")) ? configured : null;
        }

        var dir = _baseDirectory;
        for (var i = 0; i < 10; i++)
        {
            if (Directory.Exists(Path.Combine(dir, ".git")))
                return dir;
            var parent = Directory.GetParent(dir);
            if (parent == null)
                break;
            dir = parent.FullName;
        }

        return null;
    }

    private static bool IsGitAvailable()
    {
        try
        {
            using var p = Process.Start(new ProcessStartInfo
            {
                FileName = "git",
                Arguments = "--version",
                UseShellExecute = false,
                RedirectStandardOutput = true,
                CreateNoWindow = true,
            });
            p?.WaitForExit(5000);
            return p is { ExitCode: 0 };
        }
        catch
        {
            return false;
        }
    }

    private static string RunGit(string repoRoot, params string[] args)
    {
        var psi = new ProcessStartInfo
        {
            FileName = "git",
            WorkingDirectory = repoRoot,
            UseShellExecute = false,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            CreateNoWindow = true,
        };
        foreach (var a in args)
            psi.ArgumentList.Add(a);

        using var p = Process.Start(psi) ?? throw new InvalidOperationException("git konnte nicht gestartet werden.");
        var stdout = p.StandardOutput.ReadToEnd();
        var stderr = p.StandardError.ReadToEnd();
        p.WaitForExit(120_000);
        if (p.ExitCode != 0)
            throw new InvalidOperationException(string.IsNullOrWhiteSpace(stderr) ? stdout : stderr.Trim());
        return stdout.Trim();
    }

    private static string ShortHash(string? hash) =>
        string.IsNullOrEmpty(hash) ? "?" : hash.Length <= 7 ? hash : hash[..7];
}
