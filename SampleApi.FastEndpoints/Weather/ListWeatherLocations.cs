using FastEndpoints;

namespace SampleApi.FastEndpoints.Weather;

public sealed class ListWeatherLocations : EndpointWithoutRequest<IReadOnlyList<WeatherLocation>>
{
    public override void Configure()
    {
        Get("/locations");
        Group<WeatherGroup>();
        AllowAnonymous();
        Summary(summary => summary.Summary = "List locations with sample forecasts");
    }

    public override Task HandleAsync(CancellationToken ct) =>
        Send.OkAsync(WeatherLocation.Samples, ct);
}
