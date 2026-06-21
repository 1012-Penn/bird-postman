param(
  [Parameter(Mandatory = $true)][string]$InputPath,
  [Parameter(Mandatory = $true)][string]$OutputPath
)

Add-Type -AssemblyName System.Drawing
Add-Type -ReferencedAssemblies System.Drawing.dll -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.Drawing;
using System.Drawing.Imaging;
using System.Runtime.InteropServices;

public static class CheckerSpriteExtractor {
  static bool IsBackdrop(byte b, byte g, byte r) {
    return r >= 220 && g >= 220 && b >= 220 && Math.Abs(r-g) <= 5 && Math.Abs(g-b) <= 5;
  }

  static void EnqueueIfBackdrop(int x, int y, int width, int height, byte[] pixels, bool[] clear, Queue<int> queue) {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    int p = y * width + x;
    if (clear[p]) return;
    int offset = p * 4;
    if (!IsBackdrop(pixels[offset], pixels[offset + 1], pixels[offset + 2])) return;
    clear[p] = true;
    queue.Enqueue(p);
  }

  public static void Extract(string input, string output) {
    using (var source = new Bitmap(input)) {
      int width = source.Width, height = source.Height;
      var rect = new Rectangle(0, 0, width, height);
      var data = source.LockBits(rect, ImageLockMode.ReadOnly, PixelFormat.Format32bppArgb);
      var pixels = new byte[Math.Abs(data.Stride) * height];
      Marshal.Copy(data.Scan0, pixels, 0, pixels.Length);
      source.UnlockBits(data);

      var clear = new bool[width * height];
      var queue = new Queue<int>();
      for (int x = 0; x < width; x++) { EnqueueIfBackdrop(x, 0, width, height, pixels, clear, queue); EnqueueIfBackdrop(x, height - 1, width, height, pixels, clear, queue); }
      for (int y = 1; y < height - 1; y++) { EnqueueIfBackdrop(0, y, width, height, pixels, clear, queue); EnqueueIfBackdrop(width - 1, y, width, height, pixels, clear, queue); }

      while (queue.Count > 0) {
        int p = queue.Dequeue(), x = p % width, y = p / width;
        EnqueueIfBackdrop(x - 1, y, width, height, pixels, clear, queue);
        EnqueueIfBackdrop(x + 1, y, width, height, pixels, clear, queue);
        EnqueueIfBackdrop(x, y - 1, width, height, pixels, clear, queue);
        EnqueueIfBackdrop(x, y + 1, width, height, pixels, clear, queue);
      }

      int minX = width, minY = height, maxX = -1, maxY = -1;
      for (int p = 0; p < clear.Length; p++) {
        int offset = p * 4;
        if (clear[p]) pixels[offset + 3] = 0;
        else if (pixels[offset + 3] > 0) { int x = p % width, y = p / width; minX = Math.Min(minX, x); minY = Math.Min(minY, y); maxX = Math.Max(maxX, x); maxY = Math.Max(maxY, y); }
      }
      if (maxX < minX || maxY < minY) throw new InvalidOperationException("No foreground sprite was found.");

      using (var transparent = new Bitmap(width, height, PixelFormat.Format32bppArgb)) {
        var outData = transparent.LockBits(rect, ImageLockMode.WriteOnly, PixelFormat.Format32bppArgb);
        Marshal.Copy(pixels, 0, outData.Scan0, pixels.Length);
        transparent.UnlockBits(outData);
        int padding = 12;
        minX = Math.Max(0, minX - padding); minY = Math.Max(0, minY - padding); maxX = Math.Min(width - 1, maxX + padding); maxY = Math.Min(height - 1, maxY + padding);
        using (var cropped = transparent.Clone(new Rectangle(minX, minY, maxX - minX + 1, maxY - minY + 1), PixelFormat.Format32bppArgb)) {
          cropped.Save(output, ImageFormat.Png);
        }
      }
    }
  }
}
'@

[CheckerSpriteExtractor]::Extract($InputPath, $OutputPath)
