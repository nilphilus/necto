using System.Text.Json.Nodes;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.OpenApi;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.OpenApi;
namespace Necto;
public sealed record NectoAccessRule(string? Policy,string? Roles,string? Schemes);
public sealed record NectoAccessDeclaration(string OperationId,bool Anonymous,NectoAccessRule[] Rules);
public static class NectoAccessHints
{
    public static OpenApiOptions Add(OpenApiOptions options,IReadOnlyList<NectoAccessDeclaration> declarations)
    {
        var registry=declarations.GroupBy(item=>item.OperationId).Where(group=>group.Count()==1).ToDictionary(group=>group.Key,group=>group.Single());
        options.AddOperationTransformer(async(operation,context,_)=>{
            if(operation.OperationId is null || !registry.TryGetValue(operation.OperationId,out var declaration))return;
            var metadata=context.Description.ActionDescriptor.EndpointMetadata;
            var authorize=metadata.OfType<IAuthorizeData>().ToArray();
            var anonymous=metadata.OfType<IAllowAnonymous>().Any() || declaration.Anonymous;
            var dynamicPolicy=metadata.OfType<AuthorizationPolicy>().Any();
            if(!anonymous && authorize.Length==0 && declaration.Rules.Length==0 && !dynamicPolicy)
            {
                var provider=context.ApplicationServices.GetService<IAuthorizationPolicyProvider>();
                dynamicPolicy=provider is not null && await provider.GetFallbackPolicyAsync() is not null;
            }
            var rules=authorize.Length>0?authorize.Select(item=>new NectoAccessRule(item.Policy,item.Roles,item.AuthenticationSchemes)).ToArray():declaration.Rules;
            operation.Extensions??=new Dictionary<string,IOpenApiExtension>();
            operation.Extensions.TryAdd("x-necto-access",new JsonNodeExtension(Describe(anonymous,rules,dynamicPolicy)));
        });return options;
    }
    public static JsonObject Describe(bool anonymous,IReadOnlyList<NectoAccessRule> rules,bool runtimePolicy)
    {
        JsonArray Values(string? value)=>new((value??"").Split(',',StringSplitOptions.TrimEntries|StringSplitOptions.RemoveEmptyEntries).Select(item=>(JsonNode?)JsonValue.Create(item)).ToArray());
        return new JsonObject {
            ["requiresAuthorization"]=!anonymous&&(rules.Count>0||runtimePolicy),["anonymousOverride"]=anonymous,["runtimePolicy"]=!anonymous&&runtimePolicy,
            ["rules"]=new JsonArray(rules.Select(rule=>(JsonNode)new JsonObject {["policy"]=rule.Policy,["anyRole"]=Values(rule.Roles),["schemes"]=Values(rule.Schemes)}).ToArray()),
            ["note"]="Endpoint metadata only. Server policies, gateways and business checks decide actual access. Separate rules are cumulative; roles within one rule are alternatives."
        };
    }
}
