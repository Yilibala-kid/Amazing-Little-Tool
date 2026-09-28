using System.Runtime.InteropServices;

namespace LoopScroller.Rendering;

internal static class PdfNative
{
    internal static readonly object Sync = new();
    private static bool _initialized;
    internal static void EnsureInitialized()
    {
        // The native library lives for the process; document/page/bitmap handles
        // have bounded ownership. Do not tear down the library under other workers.
        if (_initialized) return;
        FPDF_InitLibrary();
        _initialized = true;
    }

    [StructLayout(LayoutKind.Sequential)]
    internal struct PageSize { public float Width; public float Height; }
    private const string Library = "pdfium";
    [DllImport(Library, CallingConvention = CallingConvention.Cdecl)] private static extern void FPDF_InitLibrary();
    [DllImport(Library, CallingConvention = CallingConvention.Cdecl)] internal static extern IntPtr FPDF_LoadMemDocument64(IntPtr data, nuint size, IntPtr password);
    [DllImport(Library, CallingConvention = CallingConvention.Cdecl)] internal static extern uint FPDF_GetLastError();
    [DllImport(Library, CallingConvention = CallingConvention.Cdecl)] internal static extern int FPDF_GetPageCount(IntPtr document);
    [DllImport(Library, CallingConvention = CallingConvention.Cdecl)] internal static extern int FPDF_GetPageSizeByIndexF(IntPtr document, int index, out PageSize size);
    [DllImport(Library, CallingConvention = CallingConvention.Cdecl)] internal static extern IntPtr FPDF_LoadPage(IntPtr document, int index);
    [DllImport(Library, CallingConvention = CallingConvention.Cdecl)] internal static extern void FPDF_ClosePage(IntPtr page);
    [DllImport(Library, CallingConvention = CallingConvention.Cdecl)] internal static extern void FPDF_CloseDocument(IntPtr document);
    [DllImport(Library, CallingConvention = CallingConvention.Cdecl)] internal static extern IntPtr FPDFBitmap_Create(int width, int height, int alpha);
    [DllImport(Library, CallingConvention = CallingConvention.Cdecl)] internal static extern int FPDFBitmap_FillRect(IntPtr bitmap, int left, int top, int width, int height, uint color);
    [DllImport(Library, CallingConvention = CallingConvention.Cdecl)] internal static extern void FPDF_RenderPageBitmap(IntPtr bitmap, IntPtr page, int x, int y, int width, int height, int rotate, int flags);
    [DllImport(Library, CallingConvention = CallingConvention.Cdecl)] internal static extern int FPDFBitmap_GetStride(IntPtr bitmap);
    [DllImport(Library, CallingConvention = CallingConvention.Cdecl)] internal static extern IntPtr FPDFBitmap_GetBuffer(IntPtr bitmap);
    [DllImport(Library, CallingConvention = CallingConvention.Cdecl)] internal static extern void FPDFBitmap_Destroy(IntPtr bitmap);
}
