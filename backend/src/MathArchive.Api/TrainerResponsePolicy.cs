namespace MathArchive.Api;

public sealed class TrainerResponsePolicy(IReadOnlyList<string> frontendOrigins)
{
    public string ContentSecurityPolicy => "sandbox allow-scripts; default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; connect-src 'none'; font-src 'none'; media-src 'none'; object-src 'none'; frame-src 'none'; worker-src 'none'; form-action 'none'; base-uri 'none'; navigate-to 'none'; frame-ancestors " +
        (frontendOrigins.Count == 0 ? "'none'" : string.Join(" ", frontendOrigins));
    public const string PermissionsPolicy = "camera=(), microphone=(), geolocation=(), payment=(), usb=(), display-capture=(), clipboard-read=(), clipboard-write=(), accelerometer=(), gyroscope=(), magnetometer=(), midi=(), serial=(), hid=(), fullscreen=()";

    public void Apply(HttpResponse response)
    {
        response.Headers.ContentSecurityPolicy = ContentSecurityPolicy;
        response.Headers.XContentTypeOptions = "nosniff";
        response.Headers["Referrer-Policy"] = "no-referrer";
        response.Headers["Permissions-Policy"] = PermissionsPolicy;
        response.Headers.CacheControl = "no-store";
    }
}
