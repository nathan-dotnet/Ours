using Microsoft.AspNetCore.Mvc;

namespace Ours.Api.Controllers;

[ApiController]
[Route("api/health")]
public class HealthController : ControllerBase
{
    [HttpGet]
    public IActionResult Get() => Ok(new { status = "ok", time = DateTimeOffset.UtcNow });
}
