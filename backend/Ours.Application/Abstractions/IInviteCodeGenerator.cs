namespace Ours.Application.Abstractions;

/// <summary>Generates human-shareable couple invite codes, e.g. "OURS-8K2F".</summary>
public interface IInviteCodeGenerator
{
    string Generate();
}
