using FastEndpoints;

namespace SampleApi.FastEndpoints.Weather;

public sealed class GetWeatherForecastRequest
{
    [RouteParam]
    public int LocationId { get; init; }
}

public sealed record ForecastDay(DateOnly Date, int TemperatureC, string Conditions);

public sealed record WeatherForecast(int LocationId, string City, ForecastDay[] Days);

public sealed class GetWeatherForecast : Endpoint<GetWeatherForecastRequest, WeatherForecast>
{
    public override void Configure()
    {
        Get("/locations/{locationId:int}/forecast");
        Group<WeatherGroup>();
        AllowAnonymous();
        Summary(summary => summary.Summary = "Get a simulated three-day forecast for a location");
        Description(builder => builder.Produces(StatusCodes.Status404NotFound));
    }

    public override Task HandleAsync(GetWeatherForecastRequest request, CancellationToken ct)
    {
        var location = WeatherLocation.Samples.FirstOrDefault(location => location.Id == request.LocationId);
        if (location is null)
            return Send.NotFoundAsync(ct);

        var today = DateOnly.FromDateTime(DateTime.UtcNow);
        var temperature = location.Id == 1 ? 16 : 12;
        var forecast = new WeatherForecast(location.Id, location.City,
        [
            new(today, temperature, "Cloudy"),
            new(today.AddDays(1), temperature - 2, "Rain"),
            new(today.AddDays(2), temperature + 1, "Clear")
        ]);

        return Send.OkAsync(forecast, ct);
    }
}
