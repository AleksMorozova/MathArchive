using MathArchive.Api.Contracts.Auth;
using MathArchive.Infrastructure.Auth;
using Microsoft.AspNetCore.Mvc;

namespace MathArchive.Api.Controllers;

[ApiController]
[Route("api/auth")]
public sealed class AuthController(AdminAuthenticationService authenticationService) : ControllerBase
{
    [HttpPost("login")]
    public ActionResult<LoginResponse> Login(LoginRequest request)
    {
        var token = authenticationService.Login(request.Username, request.Password);
        return token is null ? Unauthorized() : Ok(new LoginResponse(token));
    }
}
