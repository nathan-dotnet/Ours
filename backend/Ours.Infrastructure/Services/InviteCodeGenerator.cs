using System.Security.Cryptography;
using Ours.Application.Abstractions;

namespace Ours.Infrastructure.Services;

/// <summary>Produces codes like "OURS-8K2F" — unambiguous characters only (no 0/O/1/I).</summary>
public class InviteCodeGenerator : IInviteCodeGenerator
{
    private const string Alphabet = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
    private const int CodeLength = 4;

    public string Generate()
    {
        Span<char> chars = stackalloc char[CodeLength];
        for (var i = 0; i < CodeLength; i++)
        {
            chars[i] = Alphabet[RandomNumberGenerator.GetInt32(Alphabet.Length)];
        }
        return $"OURS-{new string(chars)}";
    }
}
