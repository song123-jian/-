using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.IO.Compression;
using System.Reflection;
using System.Text;
using System.Windows.Forms;

internal static class SetupBootstrap
{
    private const string Title = "工作安装程序";

    [STAThread]
    private static int Main(string[] args)
    {
        bool quiet = false;
        string isolatedRoot = null;
        string installDirectory = null;
        string extractRoot = null;
        string reportFile = null;
        string working = null;
        bool temporary = false;
        string result = "";
        int exitCode = 1;
        try
        {
            for (int i = 0; i < args.Length; i++)
            {
                if (args[i] == "--quiet") quiet = true;
                else if (args[i] == "--isolated-root" && i + 1 < args.Length) isolatedRoot = Path.GetFullPath(args[++i]);
                else if (args[i] == "--install-dir" && i + 1 < args.Length) installDirectory = args[++i];
                else if (args[i] == "--extract" && i + 1 < args.Length) extractRoot = Path.GetFullPath(args[++i]);
                else if (args[i] == "--report-file" && i + 1 < args.Length) reportFile = Path.GetFullPath(args[++i]);
                else throw new ArgumentException("Unknown or incomplete installer argument: " + args[i]);
            }
            if (extractRoot != null && (isolatedRoot != null || installDirectory != null))
                throw new ArgumentException("Choose extraction or installation.");
            if (extractRoot == null && isolatedRoot == null && !quiet)
            {
                Application.EnableVisualStyles();
                installDirectory = ChooseInstallDirectory(installDirectory);
                if (installDirectory == null)
                {
                    result = "INSTALL_CANCELLED";
                    exitCode = 0;
                    return exitCode;
                }
            }
            working = extractRoot ?? Path.Combine(Path.GetTempPath(), "PriceQuerySetup-" + Guid.NewGuid().ToString("N"));
            if (Directory.Exists(working) || File.Exists(working)) throw new IOException("Extraction directory already exists.");
            Directory.CreateDirectory(working);
            temporary = extractRoot == null;
            ExtractPackage(working);
            if (extractRoot != null)
            {
                result = "EXTRACT_OK=" + working;
                exitCode = 0;
            }
            else
            {
                StringBuilder output = new StringBuilder();
                ProcessStartInfo info = new ProcessStartInfo();
                info.FileName = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.System), "WindowsPowerShell\\v1.0\\powershell.exe");
                info.Arguments = "-NoLogo -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File " + Quote(Path.Combine(working, "install.ps1"));
                if (quiet) info.Arguments += " -Quiet";
                if (isolatedRoot != null) info.Arguments += " -IsolatedRoot " + Quote(isolatedRoot);
                if (installDirectory != null) info.Arguments += " -InstallDirectory " + Quote(installDirectory);
                info.WorkingDirectory = working;
                info.UseShellExecute = false;
                info.CreateNoWindow = true;
                info.EnvironmentVariables.Remove("PSModulePath");
                info.RedirectStandardOutput = true;
                info.RedirectStandardError = true;
                using (Process process = new Process())
                {
                    process.StartInfo = info;
                    DataReceivedEventHandler capture = delegate(object sender, DataReceivedEventArgs e)
                    {
                        if (e.Data != null) lock (output) output.AppendLine(e.Data);
                    };
                    process.OutputDataReceived += capture;
                    process.ErrorDataReceived += capture;
                    process.Start();
                    process.BeginOutputReadLine();
                    process.BeginErrorReadLine();
                    process.WaitForExit();
                    exitCode = process.ExitCode;
                }
                result = output.ToString();
            }
        }
        catch (Exception error)
        {
            result = error.Message;
            if (!quiet) MessageBox.Show("安装未完成：\n" + result, Title, MessageBoxButtons.OK, MessageBoxIcon.Error);
            exitCode = 1;
        }
        finally
        {
            if (temporary && working != null)
            {
                try
                {
                    string parent = Path.GetFullPath(Path.GetDirectoryName(working)).TrimEnd(Path.DirectorySeparatorChar);
                    string expected = Path.GetFullPath(Path.GetTempPath()).TrimEnd(Path.DirectorySeparatorChar);
                    if (String.Equals(parent, expected, StringComparison.OrdinalIgnoreCase) && Path.GetFileName(working).StartsWith("PriceQuerySetup-", StringComparison.Ordinal))
                        Directory.Delete(working, true);
                }
                catch (IOException) { }
                catch (UnauthorizedAccessException) { }
            }
            if (reportFile != null)
            {
                try { File.WriteAllText(reportFile, "EXIT_CODE=" + exitCode + Environment.NewLine + result, new UTF8Encoding(false)); }
                catch (Exception) { exitCode = 1; }
            }
        }
        return exitCode;
    }

    private static string ChooseInstallDirectory(string initial)
    {
        using (Form form = new Form())
        {
            form.Text = Title;
            form.ClientSize = new Size(620, 210);
            form.FormBorderStyle = FormBorderStyle.FixedDialog;
            form.StartPosition = FormStartPosition.CenterScreen;
            form.MaximizeBox = false;
            form.MinimizeBox = false;
            form.AutoScaleMode = AutoScaleMode.Dpi;
            Label label = new Label { Text = "安装位置", Left = 20, Top = 20, AutoSize = true };
            TextBox path = new TextBox { Left = 20, Top = 48, Width = 478, AccessibleName = "安装位置" };
            path.Text = initial ?? Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Programs\\PriceQueryDesktop");
            Button browse = new Button { Text = "浏览…", Left = 510, Top = 46, Width = 90, Height = 28 };
            browse.Click += delegate
            {
                using (FolderBrowserDialog picker = new FolderBrowserDialog())
                {
                    picker.Description = "选择安装文件夹（空文件夹，或仅含保留的 data）";
                    picker.ShowNewFolderButton = true;
                    if (Directory.Exists(path.Text)) picker.SelectedPath = path.Text;
                    if (picker.ShowDialog(form) == DialogResult.OK) path.Text = picker.SelectedPath;
                }
            };
            Label note = new Label { Left = 20, Top = 88, Width = 580, Height = 50,
                Text = "可选择其他本地磁盘上的可写文件夹；不支持系统目录或网络路径。\n卸载保留 data；更换目录不会自动迁移旧数据。" };
            Button install = new Button { Text = "安装", Left = 400, Top = 162, Width = 95, Height = 30 };
            install.Click += delegate
            {
                if (String.IsNullOrWhiteSpace(path.Text))
                {
                    MessageBox.Show(form, "请选择安装位置。", Title, MessageBoxButtons.OK, MessageBoxIcon.Warning);
                    path.Focus();
                    return;
                }
                form.DialogResult = DialogResult.OK;
            };
            Button cancel = new Button { Text = "取消", Left = 505, Top = 162, Width = 95, Height = 30, DialogResult = DialogResult.Cancel };
            form.Controls.AddRange(new Control[] { label, path, browse, note, install, cancel });
            form.AcceptButton = install;
            form.CancelButton = cancel;
            return form.ShowDialog() == DialogResult.OK ? path.Text : null;
        }
    }

    private static void ExtractPackage(string destination)
    {
        HashSet<string> expected = new HashSet<string>(new string[] { "app.exe", "app.ico", "install.ps1", "uninstall.ps1", "uninstall.cmd", "package.json" }, StringComparer.Ordinal);
        using (Stream stream = Assembly.GetExecutingAssembly().GetManifestResourceStream("PriceQueryPackage.zip"))
        using (ZipArchive archive = new ZipArchive(stream, ZipArchiveMode.Read))
        {
            foreach (ZipArchiveEntry entry in archive.Entries)
            {
                if (Path.GetFileName(entry.FullName) != entry.FullName || !expected.Remove(entry.FullName))
                    throw new InvalidDataException("Unexpected installer package entry.");
                using (Stream source = entry.Open())
                using (FileStream target = new FileStream(Path.Combine(destination, entry.FullName), FileMode.CreateNew, FileAccess.Write))
                    source.CopyTo(target);
            }
        }
        if (expected.Count != 0) throw new InvalidDataException("Incomplete installer package.");
    }

    private static string Quote(string value)
    {
        StringBuilder result = new StringBuilder("\"");
        int slashes = 0;
        foreach (char c in value)
        {
            if (c == '\\') slashes++;
            else
            {
                result.Append('\\', c == '"' ? slashes * 2 + 1 : slashes);
                result.Append(c);
                slashes = 0;
            }
        }
        result.Append('\\', slashes * 2);
        result.Append('"');
        return result.ToString();
    }
}
