namespace MathArchive.Domain.Testing;

public sealed class Student
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public string FirstName { get; set; } = "";
    public string LastName { get; set; } = "";
    public string NormalizedFirstName { get; set; } = "";
    public string NormalizedLastName { get; set; } = "";
    public int Grade { get; set; }
    public string? PasswordHash { get; set; }
    public List<StudentAuthenticationIdentity> AuthenticationIdentities { get; set; } = [];
    public Guid SessionVersion { get; set; } = Guid.NewGuid();
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset? LastLoginAt { get; set; }
    public bool IsActive { get; set; } = true;
    public int FailedLogins { get; set; }
    public DateTimeOffset? LockedUntil { get; set; }
}

public sealed class StudentAuthenticationIdentity
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid StudentId { get; set; }
    public string Provider { get; set; } = "Google";
    public string Subject { get; set; } = "";
    public DateTimeOffset CreatedAt { get; set; }
}
