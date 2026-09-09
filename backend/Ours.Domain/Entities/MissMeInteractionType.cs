namespace Ours.Domain.Entities;

/// <summary>Controlled set of Miss Me interaction kinds — same string-constant pattern as <see cref="VaultCategory"/>/<see cref="TransactionType"/>.</summary>
public static class MissMeInteractionType
{
    public const string MissMe = "MissMe";
    public const string MissYouToo = "MissYouToo";

    public static readonly IReadOnlyList<string> All = [MissMe, MissYouToo];

    public static bool IsValid(string? value) => value is not null && All.Contains(value);
}
